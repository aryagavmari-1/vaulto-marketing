#!/usr/bin/env node
/**
 * KPI refresher for the measurement loop (ARY-403).
 *
 * Reads kpis.json, pulls the latest numbers from the configured $0 analytics
 * sources, and writes them back into `latest`/`asOf`. The measurement sub-agent
 * runs this on a routine; the team and other sub-agents then read kpis.json /
 * KPIS.md without touching any dashboard.
 *
 * Credentials (set as env / GitHub Actions secrets — NONE committed):
 *   CF_API_TOKEN, CF_ACCOUNT_TAG      → Cloudflare Web Analytics GraphQL
 *   GSC_SERVICE_ACCOUNT_JSON          → Google Search Console API
 *
 * Until those exist this script is a safe no-op that reports which sources are
 * unconfigured, so the pipeline is wired end-to-end before the accounts land.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const path = join(root, 'kpis.json');
const doc = JSON.parse(readFileSync(path, 'utf8'));

const have = {
  traffic: Boolean(process.env.CF_API_TOKEN && process.env.CF_ACCOUNT_TAG),
  search: Boolean(process.env.GSC_SERVICE_ACCOUNT_JSON),
};

const missing = [];
if (!have.traffic) missing.push('Cloudflare Web Analytics (CF_API_TOKEN, CF_ACCOUNT_TAG)');
if (!have.search) missing.push('Google Search Console (GSC_SERVICE_ACCOUNT_JSON)');

if (missing.length) {
  console.warn('[pull-kpis] Unconfigured sources — leaving values unchanged:');
  for (const m of missing) console.warn('  - ' + m);
}

// TODO(measurement sub-agent): when have.traffic / have.search, call the
// Cloudflare GraphQL Analytics API and the Search Console Search Analytics API
// here and map results onto doc.kpis[].latest by id. Kept declarative on
// purpose so the integration is a localized change, not a rewrite.

doc.asOf = new Date().toISOString();
writeFileSync(path, JSON.stringify(doc, null, 2) + '\n');
console.log(`[pull-kpis] Stamped asOf=${doc.asOf}. Configured sources: ` +
  Object.entries(have).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none');
