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
 *   CF_API_TOKEN                   → Cloudflare Web Analytics GraphQL (traffic)
 *   CF_ACCOUNT_TAG (optional)      → account id; discovered from the token if unset
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
 *   - Activation (waitlist_signups) is AUTO-SOURCED from the app's own
 *     registration count (ARY-2490): there is no on-site waitlist form (the
 *     marketing CTAs hand off to the app — ARY-1864), so the canonical signup
 *     number is `mobile_users`, read from the token-gated backend endpoint
 *     KPI_SIGNUPS_URL (GET /api/metrics/signups) with KPI_SIGNUPS_TOKEN.
 *     `signup_conversion_rate` is DERIVED from it against `organic_sessions`.
 *     A manual KPI_WAITLIST_SIGNUPS still overrides the API (correction lever).
 *     If KPI_SIGNUPS_URL is configured but the fetch fails, that is a HARD error
 *     (non-zero exit / red build) — never a silent null, which is the exact
 *     regression this endpoint exists to prevent. `activated_vaults` stays null
 *     until the app is GA.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSign } from 'node:crypto';
import { resolveAccountTag, classifyReferers } from './cf-account.mjs';
import { buildBreakdown, renderBreakdownMarkdown } from './gsc-breakdown.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const path = join(root, 'kpis.json');
const breakdownJsonPath = join(root, 'gsc-breakdown.json');
const breakdownMdPath = join(root, 'GSC-BREAKDOWN.md');
const doc = JSON.parse(readFileSync(path, 'utf8'));

const WINDOW_DAYS = Number(process.env.KPI_WINDOW_DAYS || 30);
// How many top pages / queries to surface in the breakdown (ARY-2489).
const BREAKDOWN_TOP = Number(process.env.KPI_BREAKDOWN_TOP || 20);

// Activation source (ARY-2490): the canonical pre-GA signup number is the app's
// own registration count (`mobile_users`), read from the token-gated backend
// endpoint GET /api/metrics/signups. Auto-sourcing it removes the human-typed
// weekly step that kept `waitlist_signups` null for 5+ weeks. A manual
// KPI_WAITLIST_SIGNUPS still wins when set, as a correction/override lever.
const SIGNUPS_URL = (process.env.KPI_SIGNUPS_URL || '').trim();
const MANUAL_SIGNUPS =
  process.env.KPI_WAITLIST_SIGNUPS != null && process.env.KPI_WAITLIST_SIGNUPS !== '';

const have = {
  traffic: Boolean(process.env.CF_API_TOKEN),
  search: Boolean(process.env.GSC_SERVICE_ACCOUNT_JSON),
  // Present when either a live API source is configured or a manual override is
  // supplied for this run. A *configured* API source that then fails is a hard
  // error (red build) — never a silent null, the failure mode ARY-2490 fixes.
  activation: Boolean(SIGNUPS_URL) || MANUAL_SIGNUPS,
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
  const { tag: accountTag } = await resolveAccountTag(token);
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

  const accounts = body.data?.viewer?.accounts ?? [];
  if (!accounts.length) {
    throw new Error(`Cloudflare returned no data for account ${accountTag}`);
  }

  let totalVisits = 0;
  let organicVisits = 0;
  let referralVisits = 0;
  for (const account of accounts) {
    totalVisits += account.total?.[0]?.sum?.visits ?? 0;
    const split = classifyReferers(account.byReferer ?? []);
    organicVisits += split.organic;
    referralVisits += split.referral;
  }

  setKpi(updates, 'organic_sessions', organicVisits);
  if (totalVisits > 0) {
    setKpi(updates, 'referral_share_rate', Math.round((referralVisits / totalVisits) * 1000) / 10);
  }
}

// ── Google Search Console (Search Analytics) ─────────────────────────────────
// Service-account JWT → OAuth token → searchAnalytics.query. Returns aggregated
// clicks / impressions / position over the window.
//
// Host note: we call searchconsole.googleapis.com rather than the legacy
// www.googleapis.com alias. Both serve `webmasters/v3/...`, but only the former
// matches the service name shown in the Cloud console API Library, so "enable
// the Google Search Console API" is unambiguous for whoever provisions the
// project — the legacy host can attribute the call to a different (disabled)
// service and fail with "API has not been used in project…". Verified against
// the published discovery doc: rootUrl https://searchconsole.googleapis.com/,
// flatPath webmasters/v3/sites/{siteUrl}/searchAnalytics/query, and the
// webmasters.readonly scope we request below.
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

// Run one searchAnalytics.query against the property. GSC data lags ~2-3 days,
// so every window ends a few days back to avoid a partial tail; all three pulls
// (aggregate + page + query) share the same window so the breakdown reconciles
// with the site totals.
const GSC_WINDOW = { startDate: isoDate(WINDOW_DAYS + 3), endDate: isoDate(3) };

async function gscQuery(siteUrl, token, { dimensions, rowLimit }) {
  const res = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...GSC_WINDOW, dimensions, rowLimit }),
    },
  );
  if (!res.ok) throw new Error(`GSC query HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()).rows ?? [];
}

async function pullSearchConsole(updates, sideEffects) {
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

  // 1. Site aggregate → the three top-line KPIs in kpis.json.
  const aggRows = await gscQuery(siteUrl, token, { dimensions: [], rowLimit: 1 });
  const row = aggRows[0];
  if (!row) {
    // Valid response, no data yet (brand-new property). Record zeros for the
    // measurable counters so the dashboard shows "live, but empty" not "stale".
    setKpi(updates, 'search_impressions', 0);
    setKpi(updates, 'search_clicks', 0);
  } else {
    setKpi(updates, 'search_impressions', Math.round(row.impressions ?? 0));
    setKpi(updates, 'search_clicks', Math.round(row.clicks ?? 0));
    if (row.position != null) setKpi(updates, 'avg_position', Math.round(row.position * 10) / 10);
  }

  // 2. Page + query breakdown → gsc-breakdown.json / GSC-BREAKDOWN.md (ARY-2489).
  // GSC returns rows sorted by clicks; pull a wide slice and re-rank by
  // impressions in buildBreakdown so "top by impressions" is exact even when a
  // high-impression / low-click page would fall outside a clicks-sorted top-N.
  const fetchLimit = Math.max(BREAKDOWN_TOP * 10, 250);
  const [pageRows, queryRows] = await Promise.all([
    gscQuery(siteUrl, token, { dimensions: ['page'], rowLimit: fetchLimit }),
    gscQuery(siteUrl, token, { dimensions: ['query'], rowLimit: fetchLimit }),
  ]);
  const breakdown = buildBreakdown({
    siteUrl,
    window: GSC_WINDOW,
    pageRows,
    queryRows,
    asOf: new Date().toISOString(),
    topN: BREAKDOWN_TOP,
  });
  sideEffects.push(() => {
    writeFileSync(breakdownJsonPath, JSON.stringify(breakdown, null, 2) + '\n');
    writeFileSync(breakdownMdPath, renderBreakdownMarkdown(breakdown));
  });
  updates.push(`gsc_breakdown=${breakdown.pages.length}p/${breakdown.queries.length}q`);
}

// ── Activation (auto-sourced from the app, ARY-2490) ─────────────────────────
// `waitlist_signups` is our pre-GA north-star proxy. There is no on-site
// waitlist form (the marketing CTAs hand off to the app — ARY-1864), so the
// canonical signup number is the app's own registration count. We read it from
// the token-gated backend endpoint KPI_SIGNUPS_URL (GET /api/metrics/signups),
// asking for the same rolling window as organic_sessions so the derived
// `signup_conversion_rate` is coherent. A manual KPI_WAITLIST_SIGNUPS overrides
// the API (correction lever). The denominator for conversion is
// `organic_sessions` (refreshed above this run, or its stored value), matching
// KPIS.md's "Visit → signup" definition.

/** Fetch the windowed signup count from the app's metrics endpoint. */
async function fetchSignupCount() {
  const url = new URL(SIGNUPS_URL);
  url.searchParams.set('days', String(WINDOW_DAYS));
  const headers = {};
  const token = (process.env.KPI_SIGNUPS_TOKEN || '').trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`signups endpoint HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  // Prefer the windowed count (aligns with organic_sessions/mo); fall back to
  // total for a differently-shaped payload.
  const n = Number(data.windowCount ?? data.total);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`signups endpoint returned no usable count: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return Math.round(n);
}

async function pullActivation(updates) {
  let signups;
  if (MANUAL_SIGNUPS) {
    const raw = process.env.KPI_WAITLIST_SIGNUPS;
    signups = Math.round(Number(raw));
    if (!Number.isFinite(signups) || signups < 0) {
      throw new Error(`KPI_WAITLIST_SIGNUPS is not a non-negative number: "${raw}"`);
    }
    console.log('[pull-kpis] activation: manual override via KPI_WAITLIST_SIGNUPS');
  } else {
    // SIGNUPS_URL is set (have.activation gated on it). A failure here is a hard
    // error — it surfaces as a red weekly build instead of silently reverting to
    // null, which is exactly the regression ARY-2490 exists to prevent.
    signups = await fetchSignupCount();
    console.log(`[pull-kpis] activation: auto-sourced ${signups} signups from ${SIGNUPS_URL}`);
  }
  setKpi(updates, 'waitlist_signups', signups);

  // Derive conversion % = signups / organic_sessions * 100, one decimal. Only
  // when we have a positive session base, else the ratio is undefined — leave
  // it rather than emit a divide-by-zero or a misleading 0/∞.
  const sessions = doc.kpis.find((k) => k.id === 'organic_sessions')?.latest;
  if (typeof sessions === 'number' && sessions > 0) {
    setKpi(updates, 'signup_conversion_rate', Math.round((signups / sessions) * 1000) / 10);
  } else {
    console.warn('[pull-kpis] signup_conversion_rate not derived: organic_sessions is 0/unknown');
  }
}

// ── Orchestrate ──────────────────────────────────────────────────────────────
const updates = [];
const errors = [];
// Deferred file writes (e.g. the GSC breakdown docs). Queued during the pull and
// flushed only on a live run, so an all-errored / no-op run touches nothing.
const sideEffects = [];

if (have.traffic) {
  try { await pullCloudflare(updates); }
  catch (e) { errors.push(`Cloudflare: ${e.message}`); }
} else {
  console.warn('[pull-kpis] Unconfigured: Cloudflare Web Analytics (CF_API_TOKEN)');
}

if (have.search) {
  try { await pullSearchConsole(updates, sideEffects); }
  catch (e) { errors.push(`Search Console: ${e.message}`); }
} else {
  console.warn('[pull-kpis] Unconfigured: Google Search Console (GSC_SERVICE_ACCOUNT_JSON)');
}

// Activation runs last so the conversion rate divides by this run's fresh
// organic_sessions when Cloudflare is configured, or the stored value otherwise.
if (have.activation) {
  try { await pullActivation(updates); }
  catch (e) { errors.push(`Activation: ${e.message}`); }
} else {
  console.warn('[pull-kpis] No activation source (set KPI_SIGNUPS_URL to auto-source, or KPI_WAITLIST_SIGNUPS to enter manually)');
}

for (const err of errors) console.error('[pull-kpis] ERROR ' + err);

// Only advance asOf when we actually pulled something live, so a no-op /
// all-errored run doesn't masquerade as a fresh dashboard.
if (updates.length) {
  doc.asOf = new Date().toISOString();
  writeFileSync(path, JSON.stringify(doc, null, 2) + '\n');
  for (const flush of sideEffects) flush();
  console.log(`[pull-kpis] Updated ${updates.length} KPI(s): ${updates.join(', ')}`);
  console.log(`[pull-kpis] Stamped asOf=${doc.asOf}.`);
} else {
  console.log('[pull-kpis] No live values pulled — kpis.json left unchanged.');
}

// Non-zero exit only if a *configured* source errored, so CI surfaces real
// breakage but a not-yet-provisioned run stays green.
if (errors.length) process.exit(1);
