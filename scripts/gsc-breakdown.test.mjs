#!/usr/bin/env node
/**
 * Tests for the GSC breakdown builder/renderer (ARY-2489). No network or creds —
 * feeds fixture rows shaped exactly like GSC searchAnalytics.query output and
 * asserts the ranking, CTR recomputation, path relativisation, markdown escaping
 * and empty-state. Run: `npm run test:kpis`.
 */
import assert from 'node:assert/strict';
import { buildBreakdown, renderBreakdownMarkdown } from './gsc-breakdown.mjs';

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`  ok  ${name}`); };

const siteUrl = 'https://myvaulto.com/';
const window = { startDate: '2026-07-26', endDate: '2026-08-25' };

// Rows as GSC returns them: dimension value in keys[0], ctr as 0-1 fraction.
const pageRows = [
  { keys: ['https://myvaulto.com/blog/ice-file-for-family'], clicks: 3, impressions: 40, ctr: 0.075, position: 12.3 },
  { keys: ['https://myvaulto.com/blog/net-worth-tracker'], clicks: 1, impressions: 60, ctr: 0.0167, position: 31.5 },
  { keys: ['https://myvaulto.com/'], clicks: 0, impressions: 25, ctr: 0, position: 44.1 },
];
const queryRows = [
  { keys: ['ice file for family'], clicks: 2, impressions: 30, ctr: 0.0667, position: 9.4 },
  { keys: ['a|b weird "query"'], clicks: 0, impressions: 55, ctr: 0, position: 52.2 },
];

test('ranks pages by impressions, not clicks', () => {
  const b = buildBreakdown({ siteUrl, window, pageRows, queryRows, asOf: '2026-08-28T00:00:00.000Z' });
  // net-worth (60 impr) outranks ice-file (40 impr) even though ice-file has more clicks.
  assert.equal(b.pages[0].key, 'https://myvaulto.com/blog/net-worth-tracker');
  assert.equal(b.pages[0].impressions, 60);
});

test('recomputes CTR from rounded clicks/impressions (percent, 1dp)', () => {
  const b = buildBreakdown({ siteUrl, window, pageRows, queryRows, asOf: 'x' });
  const ice = b.pages.find((p) => p.key.endsWith('ice-file-for-family'));
  assert.equal(ice.ctr, 7.5); // 3/40 = 7.5%
  const home = b.pages.find((p) => p.key === siteUrl);
  assert.equal(home.ctr, 0); // 0 impressions-safe → 0, no divide-by-zero
});

test('honours topN', () => {
  const b = buildBreakdown({ siteUrl, window, pageRows, queryRows, asOf: 'x', topN: 1 });
  assert.equal(b.pages.length, 1);
  assert.equal(b.queries.length, 1);
});

test('markdown relativises page URLs and escapes pipes', () => {
  const b = buildBreakdown({ siteUrl, window, pageRows, queryRows, asOf: '2026-08-28T00:00:00.000Z' });
  const md = renderBreakdownMarkdown(b);
  assert.match(md, /\| \/blog\/net-worth-tracker \| 60 \| 1 \| 1\.7% \| 31\.5 \|/);
  assert.ok(!md.includes('https://myvaulto.com/blog/net-worth-tracker |'), 'page URL should be relativised');
  assert.match(md, /a\\\|b weird "query"/); // pipe escaped so the table stays valid
  assert.match(md, /Top pages by impressions/);
  assert.match(md, /Top queries by impressions/);
});

test('empty rows render a no-data placeholder, not a crash', () => {
  const b = buildBreakdown({ siteUrl, window, pageRows: [], queryRows: [], asOf: 'x' });
  const md = renderBreakdownMarkdown(b);
  assert.equal(b.pages.length, 0);
  assert.match(md, /_\(no data this window\)_/);
});

console.log(`\n${passed} test(s) passed.`);
