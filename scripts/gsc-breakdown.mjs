/**
 * GSC page & query breakdown builder + renderer (ARY-2489).
 *
 * kpis.json only carries site-level GSC aggregates (impressions/clicks/position
 * for the whole property), which is blind to *which* pages and queries drive the
 * gains vs which entered at page 3-5 dragging the average average down. This
 * module turns the per-`page` and per-`query` rows from a GSC
 * `searchAnalytics.query` into a compact top-N breakdown object and a
 * human-readable markdown table the CMO reads straight from the repo.
 *
 * Split out from pull-kpis.mjs so the row → table transform is a pure function
 * with no network or filesystem in it, and can be tested against a fixture
 * without live GSC credentials (which are still blocked on ARY-409).
 */

/** Round to `dp` decimal places, returning a Number (not a string). */
function round(n, dp = 1) {
  const f = 10 ** dp;
  return Math.round((Number(n) || 0) * f) / f;
}

/**
 * Normalise one GSC searchAnalytics row (dimension value in `keys[0]`) into a
 * flat record. GSC returns `ctr` as a 0-1 fraction and `position` as a float.
 */
function normaliseRow(row) {
  const impressions = Math.round(row.impressions ?? 0);
  const clicks = Math.round(row.clicks ?? 0);
  return {
    key: row.keys?.[0] ?? '',
    impressions,
    clicks,
    // Recompute CTR from the rounded integers so it always agrees with the two
    // columns beside it, rather than trusting GSC's own fractional ctr.
    ctr: impressions > 0 ? round((clicks / impressions) * 100, 1) : 0,
    position: round(row.position ?? 0, 1),
  };
}

/**
 * Take the top `topN` rows by impressions (the metric that surged — ARY-2487),
 * breaking ties by clicks so a page that actually earns clicks ranks above a
 * pure-impression page with the same volume.
 */
function topByImpressions(rows, topN) {
  return (rows ?? [])
    .map(normaliseRow)
    .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks)
    .slice(0, topN);
}

/**
 * Build the machine-readable breakdown object written to gsc-breakdown.json.
 *
 * @param {object} o
 * @param {string} o.siteUrl        GSC property, e.g. https://myvaulto.com/
 * @param {{startDate:string,endDate:string}} o.window  the query window
 * @param {object[]} o.pageRows     raw GSC rows, dimensions:['page']
 * @param {object[]} o.queryRows    raw GSC rows, dimensions:['query']
 * @param {string} o.asOf           ISO timestamp for this pull
 * @param {number} [o.topN=20]
 */
export function buildBreakdown({ siteUrl, window, pageRows, queryRows, asOf, topN = 20 }) {
  return {
    schemaVersion: 1,
    asOf,
    siteUrl,
    window,
    topN,
    pages: topByImpressions(pageRows, topN),
    queries: topByImpressions(queryRows, topN),
  };
}

/** Escape a dimension value so it is safe inside a markdown table cell. */
function cell(value) {
  return String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

/** Turn the site URL into a page-relative path so the table stays scannable. */
function relPath(page, siteUrl) {
  if (typeof page !== 'string') return '';
  let rel = page;
  if (siteUrl && page.startsWith(siteUrl)) rel = page.slice(siteUrl.length - 1); // keep leading /
  else rel = page.replace(/^https?:\/\/[^/]+/, '');
  return rel || '/';
}

function table(rows, firstHeader, firstCell) {
  const head = `| ${firstHeader} | Impr | Clicks | CTR | Avg pos |\n| --- | --: | --: | --: | --: |`;
  if (!rows.length) return `${head}\n| _(no data this window)_ |  |  |  |  |`;
  const body = rows
    .map((r) => `| ${firstCell(r)} | ${r.impressions} | ${r.clicks} | ${r.ctr}% | ${r.position} |`)
    .join('\n');
  return `${head}\n${body}`;
}

/**
 * Render the breakdown object as the GSC-BREAKDOWN.md document body. Pure string
 * transform — no I/O — so the exact output can be asserted in a test.
 */
export function renderBreakdownMarkdown(b) {
  const pagesTable = table(b.pages, 'Page', (r) => cell(relPath(r.key, b.siteUrl)));
  const queriesTable = table(b.queries, 'Query', (r) => cell(r.key));
  return `# GSC page & query breakdown

> **Auto-generated** by \`scripts/pull-kpis.mjs\` on the weekly *Refresh KPIs* run
> (ARY-2489). Do not edit by hand — changes are overwritten on the next refresh.
> The site-level aggregates live in [\`kpis.json\`](./kpis.json); this file breaks
> those down so the CMO can judge winners **by page and query**, not just the
> portfolio average (ARY-2487).

- **Property:** ${b.siteUrl}
- **Window:** ${b.window.startDate} → ${b.window.endDate} (GSC lags ~3 days, so the window ends a few days back)
- **As of:** ${b.asOf}
- **Showing:** top ${b.topN} by impressions

## Top pages by impressions

${pagesTable}

## Top queries by impressions

${queriesTable}

---

_How to read it: a page/query gaining **impressions** with a low **avg pos** (page
3-5, i.e. >20) is entering the index and dragging the site average up — that's the
benign "new-page dilution" pattern, not a regression. Judge winners by **clicks**
and **CTR**, not by portfolio-average position (ARY-2487)._
`;
}
