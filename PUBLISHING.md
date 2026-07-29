# Publishing pipeline — content sub-agent runbook (ARY-403)

How content gets from a sub-agent's draft to a live, indexed page. The loop is
**git-native and $0**: content is Markdown in this repo, a push deploys it, SEO
is automatic.

## Where content lives

| Content type | Location | Becomes |
| --- | --- | --- |
| Blog / SEO articles | `src/content/blog/*.md` | `/blog/<slug>/` (auto-listed on `/blog/`) |
| Landing-page copy | `src/config/content.ts` | the home page sections |
| Brand/domain/contacts | `src/config/brand.ts` | site-wide |

New blog posts appear automatically — drop a schema-valid `.md` in
`src/content/blog/` and it routes itself. No code changes.

## The safe write-boundary (content sub-agent contract)

A content sub-agent may **only** create/edit files under:

- `src/content/blog/**` — articles
- `src/config/content.ts` — landing copy (text values only)

It must **not** touch: `src/layouts/`, `src/components/`, `src/config/brand.ts`,
`src/config/i18n.ts`, `astro.config.mjs`, `scripts/`, `.github/`. Those are infra
(this issue / CTO). This keeps SEO, analytics, and routing correct no matter who's
writing content.

## Authoring loop

1. **Scaffold:** `node scripts/new-post.mjs "My article title"` → creates
   `src/content/blog/<slug>.md` with valid frontmatter and `draft: true`.
2. **Write** the article. Frontmatter schema (enforced at build by the content
   collection — a bad post fails the build, never ships broken):
   - `title` (string), `description` (150–160 char meta), `pubDate` (YYYY-MM-DD)
   - `draft` (bool — `true` hides it), `placeholder` (bool — marks template stubs)
3. **Preview locally:** `npm run dev`, then `npm run build` to confirm it's valid.
4. **Publish:** set `draft: false`, commit, push to `master`. The deploy workflow
   (`.github/workflows/deploy.yml`) builds and ships to Cloudflare Pages.

## What's automatic (no sub-agent action needed)

- Canonical URL, `<title>`/meta, Open Graph + Twitter cards
- JSON-LD structured data (`Organization`, `WebSite`, `SoftwareApplication`,
  `FAQPage`, `BreadcrumbList`, `BlogPosting`) — see `I18N.md`
- `hreflang` alternates + localized `sitemap-index.xml` (regenerated each build)
- Privacy-friendly analytics + on-site event tracking

## Social posting

The repeatable path: the social sub-agent drafts from the same article, a
human/CEO approves per the CMO's operating system (ARY-402), the approved batch is
packaged as a **publish-manifest**, then it posts. Track outbound social → site via
UTM links (`?utm_source=...`) so the conversion shows up in the KPIs.

**The $0 auto-poster is built** (ARY-654) — see [`social-publisher/`](social-publisher/README.md).
It reads a board-approved publish-manifest and, on the Day-0..5 stagger:

- **Pinterest** → auto-posts via Pinterest API v5 (`node run.mjs --all manifests`,
  scheduled daily by `.github/workflows/social-publish.yml`, $0).
- **LinkedIn / short-form** → flagged `manual-required` with the approved copy
  (Track 1 manual, unchanged) — graceful degradation, no loss.

No paid SaaS aggregator (board directive 2026-07-04). Pinterest goes live once its
secrets are provisioned after the founder-OAuth + CEO checkpoint; until then the
worker safely dry-runs and everything stays manual.

## Claim check: free tier vs paid report

Run `npm run guard:tier` (alias: `check:claims`) before publishing anything that mentions the AI
overview. It fails the moment copy promises a **paid** advisory deliverable
while calling it **free**.

This exists because a string grep is not enough. ARY-1364 cleared six lines by
grepping `"risk area"`; a seventh survived saying `"recommended actions"`
(ARY-1369), and an eighth said `"the risks that matter"` — same claim, no
matching substring. The script greps the **capability** (every known phrasing of
a paid-only field), scoped to the paragraph, since the word "free" and the
over-claimed noun are usually in different sentences.

What each tier actually ships (source of truth:
`artifacts/api-server/src/lib/advisoryPipeline.ts`):

| | Free `AdvisoryOverview` | Paid `AdvisoryReport` |
|---|---|---|
| Sections | what happens today · likely costs & taxes · gaps in your current protection · what a detailed report would add | + risk areas · recommended actions · key considerations · asset breakdown · risk projection |
| Figures | estimate ranges, line items, cost of inaction, assumptions | as free, plus the above |

So: describe the free tier with **"estimate ranges"**, **"gaps in your
protection"**, **"the cost of leaving things as they are"**, and **"what a
detailed report would add"**. Never with "risk areas", "recommended actions",
"next steps", or "key considerations" — those are the paid report, and naming
them as free is the one claim this site cannot make. Referring to them is fine
when handed to the paid tier explicitly ("the detailed report adds recommended
actions"); the script allows that and only that.

When you add a new phrasing, add it to `PAID_CAPABILITIES` in the script rather
than fixing the one line — the synonym is the bug, not the sentence.

## Cost

$0: Cloudflare Pages (free static hosting + CI), Cloudflare Web Analytics (free),
Google Search Console (free). The only paid items, if ever wanted, are flagged as
CEO/board asks in ARY-403 — nothing here blocks on them.
