#!/usr/bin/env node
/**
 * KPI refresher for the measurement loop (ARY-403 / ARY-406).
 *
 * Reads kpis.json, pulls the latest numbers from the configured $0 analytics
 * sources, maps them onto kpis[].latest by `id`, and writes them back with a
 * fresh `asOf`. The measurement routine runs this on a cadence; the team and
 * the marketing sub-agents then read kpis.json / KPIS.md without ever touching
 * a dashboard. (See KPIS.md → "The optimisation loop".)
 *
 * Sources (credentials set as env / GitHub Actions secrets — NONE committed):
 *   CF_API_TOKEN, CF_ACCOUNT_TAG   → Cloudflare Web Analytics GraphQL (traffic)
 *   GSC_SERVICE_ACCOUNT_JSON       → Google Search Console Search Analytics
 *   GSC_SITE_URL  (optional)       → GSC property, default https://myvaulto.com/
 *   KPI_WINDOW_DAYS (optional)     → rolling window, default 30 (KPIs are "/mo")
 *
 * Design notes:
 *   - Zero runtime deps. JWT signing for GSC uses node:crypto; both APIs use the
 *     global fetch (Node >= 18). Keeps the static repo lean and the integration
 *     a localized change.
 *   - Each source is isolated: one failing (or unconfigured) source never blocks
 *     the other, and an unconfigured source leaves its KPIs unchanged. So the
 *     pipeline is safe to run end-to-end before the live accounts/tokens land
 *     (blocked on ARY-409); it becomes live the moment the secrets are set.
 *   - Conversion-source KPIs (waitlist_signups, signup_conversion_rate,
 *     activated_vaults) are NOT auto-pulled: they come from on-site analytics
 *     goals / app data with no free read API, so they are left for manual /
 *     downstream entry. This script owns the `search` + `traffic` sources only.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSign } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const path = join(root, 'kpis.json');
const doc = JSON.parse(readFileSync(path, 'utf8'));

const WINDOW_DAYS = Number(process.env.KPI_WINDOW_DAYS || 30);
const SEARCH_ENGINE_HOSTS = /(^|\.)(google|bing|duckduckgo|ecosia|yahoo|yandex|baidu|brave)\./i;

const have = {
  traffic: Boolean(process.env.CF_API_TOKEN && process.env.CF_ACCOUNT_TAG),
  search: Boolean(process.env.GSC_SERVICE_ACCOUNT_JSON),
};

/** YYYY-MM-DD for `d` days ago (UTC), inclusive window helper. */
function isoDate(daysAgo) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/** Write a value onto a KPI by id; returns true if the id exists. */
function setKpi(updates, id, value) {
  const kpi = doc.kpis.find((k) => k.id === id);
  if (!kpi || value == null || Number.isNaN(value)) return false;
  kpi.latest = value;
  updates.push(`${id}=${value}`);
  return true;
}

// ── Cloudflare Web Analytics (RUM) ───────────────────────────────────────────
// Pulls total visits over the window and the per-referer breakdown so we can
// split organic-search traffic (organic_sessions) and the referral share
// (referral_share_rate) without any extra dependency.
async function pullCloudflare(updates) {
  const token = process.env.CF_API_TOKEN;
  const accountTag = process.env.CF_ACCOUNT_TAG;
  const query = `
    query Rum($accountTag: String!, $start: String!, $end: String!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          total: rumPageloadEventsAdaptiveGroups(
            filter: { date_geq: $start, date_leq: $end }
            limit: 1
          ) {
            sum { visits }
          }
          byReferer: rumPageloadEventsAdaptiveGroups(
            filter: { date_geq: $start, date_leq: $end }
            limit: 500
            orderBy: [sum_visits_DESC]
          ) {
            sum { visits }
            dimensions { refererHost }
          }
        }
      }
    }`;
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: { accountTag, start: isoDate(WINDOW_DAYS), end: isoDate(0) },
    }),
  });
  if (!res.ok) throw new Error(`Cloudflare HTTP ${res.status}: ${await res.text()}`);
  const body = await res.json();
  if (body.errors?.length) throw new Error(`Cloudflare GraphQL: ${JSON.stringify(body.errors)}`);

  const account = body.data?.viewer?.accounts?.[0];
  if (!account) throw new Error('Cloudflare returned no account (check CF_ACCOUNT_TAG)');

  const totalVisits = account.total?.[0]?.sum?.visits ?? 0;
  let organicVisits = 0;
  let referralVisits = 0;
  for (const row of account.byReferer ?? []) {
    const host = row.dimensions?.refererHost || '';
    const visits = row.sum?.visits ?? 0;
    if (!host || host === '(none)' || host === 'myvaulto.com' || host === 'marketing.myvaulto.com') {
      continue; // direct / self-referral
    }
    if (SEARCH_ENGINE_HOSTS.test(host)) organicVisits += visits;
    else referralVisits += visits;
  }

  setKpi(updates, 'organic_sessions', organicVisits);
  if (totalVisits > 0) {
    setKpi(updates, 'referral_share_rate', Math.round((referralVisits / totalVisits) * 1000) / 10);
  }
}

// ── Google Search Console (Search Analytics) ─────────────────────────────────
// Service-account JWT → OAuth token → searchAnalytics.query. Returns aggregated
// clicks / impressions / position over the window.
function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function gscAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/webmasters.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const signature = signer.sign(sa.private_key).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jwt = `${header}.${claim}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`GSC token HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

async function pullSearchConsole(updates) {
  let sa;
  try {
    sa = JSON.parse(process.env.GSC_SERVICE_ACCOUNT_JSON);
  } catch {
    throw new Error('GSC_SERVICE_ACCOUNT_JSON is not valid JSON');
  }
  if (!sa.client_email || !sa.private_key) {
    throw new Error('GSC_SERVICE_ACCOUNT_JSON missing client_email / private_key');
  }
  const siteUrl = process.env.GSC_SITE_URL || 'https://myvaulto.com/';
  const token = await gscAccessToken(sa);

  // GSC data lags ~2-3 days; end the window a few days back to avoid a partial tail.
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate: isoDate(WINDOW_DAYS + 3),
        endDate: isoDate(3),
        dimensions: [],
        rowLimit: 1,
      }),
    },
  );
  if (!res.ok) throw new Error(`GSC query HTTP ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const row = body.rows?.[0];
  if (!row) {
    // Valid response, no data yet (brand-new property). Record zeros for the
    // measurable counters so the dashboard shows "live, but empty" not "stale".
    setKpi(updates, 'search_impressions', 0);
    setKpi(updates, 'search_clicks', 0);
    return;
  }
  setKpi(updates, 'search_impressions', Math.round(row.impressions ?? 0));
  setKpi(updates, 'search_clicks', Math.round(row.clicks ?? 0));
  if (row.position != null) setKpi(updates, 'avg_position', Math.round(row.position * 10) / 10);
}

// ── Orchestrate ──────────────────────────────────────────────────────────────
const updates = [];
const errors = [];

if (have.traffic) {
  try { await pullCloudflare(updates); }
  catch (e) { errors.push(`Cloudflare: ${e.message}`); }
} else {
  console.warn('[pull-kpis] Unconfigured: Cloudflare Web Analytics (CF_API_TOKEN, CF_ACCOUNT_TAG)');
}

if (have.search) {
  try { await pullSearchConsole(updates); }
  catch (e) { errors.push(`Search Console: ${e.message}`); }
} else {
  console.warn('[pull-kpis] Unconfigured: Google Search Console (GSC_SERVICE_ACCOUNT_JSON)');
}

for (const err of errors) console.error('[pull-kpis] ERROR ' + err);

// Only advance asOf when we actually pulled something live, so a no-op /
// all-errored run doesn't masquerade as a fresh dashboard.
if (updates.length) {
  doc.asOf = new Date().toISOString();
  writeFileSync(path, JSON.stringify(doc, null, 2) + '\n');
  console.log(`[pull-kpis] Updated ${updates.length} KPI(s): ${updates.join(', ')}`);
  console.log(`[pull-kpis] Stamped asOf=${doc.asOf}.`);
} else {
  console.log('[pull-kpis] No live values pulled — kpis.json left unchanged.');
}

// Non-zero exit only if a *configured* source errored, so CI surfaces real
// breakage but a not-yet-provisioned run stays green.
if (errors.length) process.exit(1);
