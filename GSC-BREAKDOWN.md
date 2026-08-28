# GSC page & query breakdown

> **Auto-generated** by `scripts/pull-kpis.mjs` on the weekly *Refresh KPIs* run
> (ARY-2489). Do not edit by hand — changes are overwritten on the next refresh.
> The site-level aggregates live in [`kpis.json`](./kpis.json); this file breaks
> those down so the CMO can judge winners **by page and query**, not just the
> portfolio average (ARY-2487).

**Status: pending live data.** No breakdown has been written yet because the
Google Search Console service-account credential is not provisioned — the same
blocker as the site-level search KPIs (**ARY-409**). The tooling is wired and
tested; the moment `GSC_SERVICE_ACCOUNT_JSON` is set as a repo secret, the next
weekly run (or a manual *Actions → Refresh KPIs → Run workflow*) replaces this
file with live top-page and top-query tables. No code change needed to go live.

Tables that will appear here on the first live run:

## Top pages by impressions

| Page | Impr | Clicks | CTR | Avg pos |
| --- | --: | --: | --: | --: |
| _(pending GSC credential — ARY-409)_ |  |  |  |  |

## Top queries by impressions

| Query | Impr | Clicks | CTR | Avg pos |
| --- | --: | --: | --: | --: |
| _(pending GSC credential — ARY-409)_ |  |  |  |  |

---

_How to read it: a page/query gaining **impressions** with a low **avg pos** (page
3-5, i.e. >20) is entering the index and dragging the site average up — that's the
benign "new-page dilution" pattern, not a regression. Judge winners by **clicks**
and **CTR**, not by portfolio-average position (ARY-2487)._
