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

Social is **off-repo** (LinkedIn/X don't accept a git push). The repeatable path:
the social sub-agent drafts from the same article, a human/CEO approves per the
CMO's operating system (ARY-402), then it posts. Track outbound social → site via
UTM links (`?utm_source=...`) so the conversion shows up in the KPIs. Wire an
auto-poster later only if a $0 path (e.g. a scheduled webhook) is approved.

## Cost

$0: Cloudflare Pages (free static hosting + CI), Cloudflare Web Analytics (free),
Google Search Console (free). The only paid items, if ever wanted, are flagged as
CEO/board asks in ARY-403 — nothing here blocks on them.
