# Social Publisher — the FREE ($0) social publishing path

Direct-platform-API publisher for board-approved social batches. **No paid SaaS
aggregator** (board directive 2026-07-04, ARY-654). Automates **Pinterest** end to
end; every other platform gracefully degrades to already-approved **manual** copy.

Parent context: ARY-626 → ARY-628 (scope) → **ARY-654** (this build). Manifest
contract: ARY-622 `publish-manifest`.

## What it does

1. Reads a board-approved **publish-manifest** (JSON in `manifests/`) — atoms of
   `{copy, graphic, UTM link, scheduleDay}`.
2. Works out which atoms are **due today** on the Day-0..5 stagger
   (`scheduleDay` days after `goLiveDate`).
3. **Pinterest** atoms → auto-posted via **Pinterest API v5** `POST /v5/pins`
   (image fetched from our own public URL — the deployed marketing site is the
   $0 media host).
4. **LinkedIn / short-form** atoms → flagged `manual-required` in the log with the
   approved copy + graphic URL, so a human posts them (Track 1). **Held** atoms
   (opt-in/manual) are flagged `held`.
5. Writes an idempotent **publish-log** (`publish-log/<manifestId>.json`) so a
   re-run never double-posts, and commits it back for an auditable history.

## Design

- `lib/publishers/base.mjs` — `PublisherClient` interface (the swap seam).
- `lib/publishers/pinterest.mjs` — Pinterest v5 adapter + token-refresh self-heal.
- `lib/publishers/manual.mjs` — graceful-degradation adapter (no network).
- `lib/publishers/index.mjs` — factory: Pinterest is automated iff its secrets are
  present, otherwise it (and every other platform) degrades to manual.
- `lib/manifest.mjs` — manifest loader + validator.
- `lib/scheduler.mjs` — Day-0..5 due-date selection (+ grace window).
- `lib/publishLog.mjs` — idempotency + write-back.
- `lib/media.mjs` — HEAD-check the graphic URL before a live post.
- `lib/runCycle.mjs` — pure, testable orchestration of one cycle.
- `run.mjs` — CLI entrypoint.

## Run

```bash
# Auto-run every approved manifest in manifests/ for today (what CI does):
node run.mjs --all manifests

# One manifest, a specific simulated day, no live calls:
node run.mjs --manifest manifests/2026-07-02-s3-inheritance-tax.json \
             --today 2026-07-02 --dry-run

# Tests:
node --test test/publisher.test.mjs
```

**Safe-by-default:** with no Pinterest secrets set, the worker runs as an
automatic **dry-run** (green, no live calls) and only writes the projected
publish-log — exactly like the KPI puller. It goes live the moment the secrets are
provisioned, with **no code change**.

## Scheduling ($0)

Runs daily via GitHub Actions cron — `../.github/workflows/social-publish.yml` —
the same free scheduled-Actions pattern the KPI puller already uses. (The worker
is a portable `node run.mjs`; a Render cron job can run the identical command if we
ever prefer Render.)

## Graphics / media host

Rendered graphic PNGs are served by the deployed marketing site itself (the $0
object store): place `<graphicKey>.png` at `public/social/<graphicKey>.png` so it
resolves at `https://myvaulto.com/social/<graphicKey>.png`. The renderer output
lives in the social-templates tooling (ARY-527/ARY-528); per cycle, copy the
cycle's PNGs into `public/social/`. Before any live post the worker HEAD-checks the
URL and **degrades that atom to manual** if the graphic isn't live yet — it never
hands Pinterest a broken image.

## Credentials (least-privilege, never committed)

Set as repo secrets (or Render env). Scopes: `pins:write` + `boards:read`. The
access token is ~30 days; the worker refreshes it on a 401 using the refresh token.

```
PINTEREST_ACCESS_TOKEN, PINTEREST_REFRESH_TOKEN,
PINTEREST_APP_ID, PINTEREST_APP_SECRET, PINTEREST_BOARD_ID
```

### ⚠️ Go-live gate (CEO checkpoint required)

This is a **$0 build → CEO-authority greenlight** (no board money card). **BUT**
before the founder does any OAuth / Pinterest business-verification step, we
**checkpoint back to the CEO** (per ARY-654). No live credentials are provisioned
until that free-scope confirmation. Founder self-service steps to enable
Pinterest, once greenlit:

1. Pinterest **business account** for the brand (free).
2. Create our **Pinterest developer app**; request **standard/production access**
   (posting) — the review is attainable for a legit business.
3. One founder **OAuth** granting `pins:write` + `boards:read` → capture the
   access + refresh tokens and target board id.
4. Store the five values as repo secrets. The daily job auto-goes-live; nothing in
   the code changes.

Until then: Pinterest atoms cleanly degrade to manual alongside LinkedIn/short-form
— zero loss vs the current all-manual Track 1.
