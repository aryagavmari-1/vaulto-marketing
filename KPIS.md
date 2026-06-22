# Marketing KPIs — readable surface

This is where the team and the marketing sub-agents read how the engine is doing.
The numbers live in [`kpis.json`](./kpis.json) (machine-readable); the
measurement sub-agent refreshes them with `node scripts/pull-kpis.mjs`.

> KPI list + targets are owned by the CMO and were **finalised in ARY-402 (2026-06-22)**.
> `kpis.json` is the source of truth; this file and the puller follow it.
>
> **North-star:** `activated_vaults` (post-launch). **Pre-launch proxy:** `waitlist_signups`.
> Targets below are directional **90-day baselines** for a brand-new domain (DA~0), $0 ads,
> pre-launch. They set the dashboard — **recalibrate after 30 days of real GSC/Cloudflare data.**

## The KPIs (v1)

v1 measurable = the first six. `activated_vaults` + `referral_share_rate` are wired as
null-target placeholders so the schema is launch-ready and we don't re-plumb later.

| KPI | Stage | 90-day target | Source | Decision rule |
| --- | --- | --- | --- | --- |
| Search impressions / mo | Awareness | ~8,000 | Search Console | Rising = content indexed/surfaced. Flat after 60d on a cluster → thin/dup content or indexing issue. |
| Organic sessions / mo | Acquisition | ~400 (mo1 ~50 → mo3 ~400) | Cloudflare | Primary reach metric; grows only if impressions **and** CTR hold. |
| Search clicks / mo | Acquisition | ~250 | Search Console | Impressions up but CTR <2% → title/meta problem, rewrite snippets; don't kill the content. |
| Avg. search position | Acquisition | ≤25 overall; ≤15 priority cluster | Search Console | Post in top-20 → double down (internal links, refresh, atomize). <50 impressions after 60d → prune/redirect. |
| Waitlist signups / mo | Activation | ~50 | Analytics goal | The demand signal that matters before GA — what social+SEO exist to grow. |
| Visit → signup conversion | Activation | ≥3% | Analytics goal | Sessions up but conv <2% → landing/offer problem, not traffic; fix CTA/page before scaling any channel. |
| Activated vaults / mo | North-star | TBD at launch | Analytics goal | The true north-star; `null` until app GA. |
| Referral / share rate | Referral | — (later) | Cloudflare | % sessions from share/referral UTM; enable once a traffic base exists. |

### Channel decision rule

Keep a social channel only if by **day 60** it drives **≥15% of sessions OR ≥10 waitlist
signups/mo**; otherwise pause and reallocate. No running channels on faith.

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
