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

## How the numbers refresh (ARY-406)

`scripts/pull-kpis.mjs` pulls live numbers and maps them onto `kpis.json` by `id`:

| KPI id | Source | How it's pulled |
| --- | --- | --- |
| `search_impressions`, `search_clicks`, `avg_position` | Search Console | Search Analytics API (service-account JWT) |
| `organic_sessions` | Cloudflare | RUM GraphQL, visits whose referer host is a search engine |
| `referral_share_rate` | Cloudflare | RUM GraphQL, non-search external referer share of total visits |
| `waitlist_signups` | conversion | **Manual weekly entry** — no on-site waitlist form to count (CTAs hand off to the app, ARY-1864); set `KPI_WAITLIST_SIGNUPS` |
| `signup_conversion_rate` | conversion | **Derived** — `waitlist_signups / organic_sessions × 100` (1 dp), computed in the same run |
| `activated_vaults` | conversion | Not populated until the app is GA (app-side data, out of this repo's reach) |

**Cadence:** the [`refresh-kpis`](./.github/workflows/refresh-kpis.yml) GitHub Action runs
weekly (Mon 06:17 UTC) + on demand, runs the puller, and commits the refreshed
`kpis.json`. Run locally any time with `npm run kpis`.

**Activation (one-time):** set these repo secrets — until then the puller is a safe
no-op (leaves `kpis.json` unchanged, exits 0), so nothing breaks pre-launch.
Blocked on the live analytics accounts (**ARY-409**).

- `CF_API_TOKEN` — Cloudflare API token with **Account → Account Analytics → Read**
  (not the Web Analytics *beacon* token, which is a site id and is rejected by the API)
- `CF_ACCOUNT_TAG` *(optional)* — read back from the token when the token sees exactly
  one account; only needed to disambiguate a multi-account token
- `GSC_SERVICE_ACCOUNT_JSON` — Google Search Console service-account key (the
  service account must be added as a user on the **verified** GSC property)
- `GSC_SITE_URL` *(optional)* — defaults to `https://myvaulto.com/`; use
  `sc-domain:myvaulto.com` for a Domain (DNS-verified) property

Run `npm run kpis:check` to preflight whichever credentials are set: it checks each
one in isolation and prints the exact remedy for a failure, without writing `kpis.json`.

**Activation (weekly manual entry):** there is no on-site waitlist form to auto-count —
the marketing CTAs hand off to `app.myvaulto.com` (ARY-1864), so the app owns any true
signup number. Until that app-side number is exposed, record the period's count by hand:

- **Via GitHub Actions (no checkout):** Actions → *Refresh KPIs* → **Run workflow** →
  enter *Waitlist signups this period* → Run. The job pulls the search/traffic KPIs,
  sets `waitlist_signups`, derives `signup_conversion_rate`, and commits `kpis.json`.
- **Locally:** `KPI_WAITLIST_SIGNUPS=<count> npm run kpis`.

Leave it blank / unset and the activation fields are left untouched (honest `null`, never a
fake `0`). `signup_conversion_rate = waitlist_signups / organic_sessions × 100` and is only
derived when `organic_sessions > 0`.

`asOf` only advances when a live value is actually pulled, so a stale dashboard is
never disguised as fresh.

## The optimisation loop

1. Content/social sub-agent ships content (see [PUBLISHING.md](./PUBLISHING.md)).
2. The `refresh-kpis` routine refreshes `kpis.json` on its cadence.
3. The team / sub-agents read `kpis.json` + Search Console to see what's working.
4. Double down on winning clusters/formats; prune losers. Back to step 1.
