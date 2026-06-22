# Marketing KPIs — readable surface

This is where the team and the marketing sub-agents read how the engine is doing.
The numbers live in [`kpis.json`](./kpis.json) (machine-readable); the
measurement sub-agent refreshes them with `node scripts/pull-kpis.mjs`.

> KPI list + targets are owned by the CMO in **ARY-402**. When that's finalised,
> update `kpis[]` in `kpis.json` to match — this file and the puller follow it.

## The KPIs (v1)

| KPI | Source | Why it matters |
| --- | --- | --- |
| Organic sessions / mo | Cloudflare Web Analytics | top-of-funnel reach from SEO/social |
| Search impressions / mo | Google Search Console | are we being surfaced in search at all |
| Search clicks / mo | Google Search Console | are the snippets earning the click |
| Avg. search position | Google Search Console | ranking trend for target clusters |
| Waitlist signups / mo | Analytics goal (`waitlist` events) | demand signal pre-launch |
| Visit → signup conversion | Analytics goal | landing-page + offer effectiveness |

## Data sources (all $0)

- **Cloudflare Web Analytics** — privacy-friendly, cookieless, no consent banner,
  unlimited and free. Pairs with the Cloudflare Pages host. Traffic + on-site goals.
- **Google Search Console** — free; impressions, clicks, queries, position. The
  authoritative source for *search* KPIs. (Bing Webmaster Tools is a free add-on.)
- **On-site events** — `cta_click`, `waitlist_view`, waitlist submit, `outbound_click`
  are already emitted by the site (cookieless, no PII) and flow to the analytics sink.

## The optimisation loop

1. Content/social sub-agent ships content (see [PUBLISHING.md](./PUBLISHING.md)).
2. `scripts/pull-kpis.mjs` refreshes `kpis.json` on a routine.
3. The team / sub-agents read `kpis.json` + Search Console to see what's working.
4. Double down on winning clusters/formats; prune losers. Back to step 1.
