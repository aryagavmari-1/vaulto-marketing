#!/usr/bin/env node
/**
 * Credential preflight for the KPI puller (ARY-556).
 *
 * `npm run kpis` is deliberately quiet: an unconfigured or broken source leaves
 * kpis.json untouched, which is right for the weekly job but useless when you
 * are trying to work out *which* of the three credentials is wrong. This script
 * is the loud counterpart — it checks each credential in isolation and prints a
 * PASS/FAIL with the exact remedy, without ever writing kpis.json.
 *
 *   CF_API_TOKEN   (+ CF_ACCOUNT_TAG, optional — auto-discovered when omitted)
 *   GSC_SERVICE_ACCOUNT_JSON
 *   GSC_SITE_URL   (optional — defaults to https://myvaulto.com/)
 *
 * Exit code 0 when every *provided* credential works, 1 when one is broken, so
 * it is safe to run with nothing configured.
 *
 * Usage: npm run kpis:check
 */
import { createSign } from 'node:crypto';
import { resolveAccountTag } from './cf-account.mjs';

const CF_API = 'https://api.cloudflare.com/client/v4';
let failures = 0;

const pass = (msg) => console.log(`  PASS  ${msg}`);
const fail = (msg, fix) => {
  failures += 1;
  console.log(`  FAIL  ${msg}`);
  if (fix) console.log(`        fix → ${fix}`);
};
const skip = (msg) => console.log(`  SKIP  ${msg}`);

function isoDate(daysAgo) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// ── Cloudflare ───────────────────────────────────────────────────────────────
async function checkCloudflare() {
  console.log('\nCloudflare Web Analytics → organic_sessions, referral_share_rate');
  const token = process.env.CF_API_TOKEN;
  if (!token) {
    skip('CF_API_TOKEN not set — traffic KPIs stay null.');
    return;
  }

  // 1. Is it a real API token at all? (The Web Analytics *beacon* token is not.)
  const verify = await fetch(`${CF_API}/user/tokens/verify`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json()).catch((e) => ({ success: false, errors: [{ message: e.message }] }));
  if (!verify.success) {
    const msg = verify.errors?.[0]?.message ?? 'unknown error';
    fail(
      `CF_API_TOKEN rejected by Cloudflare: ${msg}`,
      'This must be an API token from dash.cloudflare.com → My Profile → API Tokens → ' +
        'Create Token. The Web Analytics *beacon* token (the one in the site snippet) ' +
        'is a site identifier, not a bearer token, and will always fail here.',
    );
    return;
  }
  pass(`CF_API_TOKEN is a valid API token (status: ${verify.result?.status ?? 'active'}).`);

  // 2. Account tag — required by the RUM datasets. Discovered from the token
  //    where possible so nobody has to copy it out of a dashboard URL.
  let accountTag;
  try {
    const resolved = await resolveAccountTag(token);
    accountTag = resolved.tag;
    pass(`Account id ${accountTag} (via ${resolved.via}).`);
  } catch (e) {
    fail(`Account id unavailable: ${e.message}`);
    return;
  }

  // 3. The real query the puller runs — proves the token's *scope* is right.
  const query = `
    query Rum($accountTag: String!, $start: String!, $end: String!) {
      viewer { accounts(filter: { accountTag: $accountTag }) {
        total: rumPageloadEventsAdaptiveGroups(
          filter: { date_geq: $start, date_leq: $end } limit: 1
        ) { sum { visits } }
      } }
    }`;
  const res = await fetch(`${CF_API}/graphql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      variables: { accountTag, start: isoDate(30), end: isoDate(0) },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (body.errors?.length) {
    fail(
      `GraphQL rejected the analytics query: ${body.errors[0]?.message}`,
      'The token needs permission Account → Account Analytics → Read, scoped to this account.',
    );
    return;
  }
  const accounts = body.data?.viewer?.accounts ?? [];
  if (!accounts.length) {
    fail(
      `Query succeeded but returned no rows for account ${accountTag}.`,
      'That account is not the one running the Web Analytics beacon.',
    );
    return;
  }
  const visits = accounts[0].total?.[0]?.sum?.visits ?? 0;
  pass(`Analytics readable: ${visits} visits in the last 30 days. Traffic KPIs will go live.`);
}

// ── Google Search Console ────────────────────────────────────────────────────
function base64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function gscAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const signature = signer.sign(sa.private_key).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claim}.${signature}`,
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function checkSearchConsole() {
  console.log('\nGoogle Search Console → search_impressions, search_clicks, avg_position');
  const raw = process.env.GSC_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    skip('GSC_SERVICE_ACCOUNT_JSON not set — search KPIs stay null.');
    return;
  }

  let sa;
  try {
    sa = JSON.parse(raw);
  } catch {
    fail(
      'GSC_SERVICE_ACCOUNT_JSON is not valid JSON.',
      'Paste the *entire* downloaded key file, including the outer { }.',
    );
    return;
  }
  if (!sa.client_email || !sa.private_key) {
    fail(
      'Key file is missing client_email / private_key.',
      'Download a JSON key (not P12) from the service account → Keys → Add key → JSON.',
    );
    return;
  }
  pass(`Key file parsed: ${sa.client_email}`);

  let token;
  try {
    token = await gscAccessToken(sa);
    pass('Service account authenticated with Google.');
  } catch (e) {
    fail(`Google rejected the service account: ${e.message}`,
      'Check the key has not been deleted/disabled in the GCP project.');
    return;
  }

  // Does the SA actually have the property? This is the step people miss.
  const siteUrl = process.env.GSC_SITE_URL || 'https://myvaulto.com/';
  const list = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (list.status === 403) {
    fail(
      'Search Console API is not enabled on the GCP project (403).',
      'GCP console → APIs & Services → Enable APIs → "Google Search Console API" → Enable.',
    );
    return;
  }
  const sites = (await list.json().catch(() => ({}))).siteEntry ?? [];
  if (!sites.length) {
    fail(
      `Service account has access to 0 properties (expected ${siteUrl}).`,
      `In Search Console open the ${siteUrl} property → Settings → Users and permissions → ` +
        `Add user → ${sa.client_email} → role Full. (The property must be verified first.)`,
    );
    return;
  }
  const match = sites.find((s) => s.siteUrl === siteUrl);
  if (!match) {
    fail(
      `Service account can see [${sites.map((s) => s.siteUrl).join(', ')}] but not ${siteUrl}.`,
      `Either add it to ${siteUrl}, or set the GSC_SITE_URL secret to one of the above ` +
        '(use sc-domain:myvaulto.com for a Domain property).',
    );
    return;
  }
  pass(`Property ${siteUrl} readable (permission: ${match.permissionLevel}).`);

  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate: isoDate(33), endDate: isoDate(3), dimensions: [], rowLimit: 1 }),
    },
  );
  if (!res.ok) {
    fail(`searchAnalytics.query failed: HTTP ${res.status} ${await res.text()}`);
    return;
  }
  const row = (await res.json()).rows?.[0];
  pass(row
    ? `Search data readable: ${Math.round(row.impressions ?? 0)} impressions, ${Math.round(row.clicks ?? 0)} clicks (last 30d).`
    : 'Query works; property has no search data yet (normal for a new property) — KPIs will record 0.');
}

console.log('KPI credential preflight (writes nothing; run `npm run kpis` once this is green)');
await checkCloudflare();
await checkSearchConsole();

console.log(
  failures
    ? `\n${failures} check(s) failed — fix the above, then re-run \`npm run kpis:check\`.`
    : '\nAll provided credentials check out. Run `npm run kpis` to write live values.',
);
process.exit(failures ? 1 : 0);
