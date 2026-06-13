# Asset Vault — v1 Marketing Site

Static [Astro](https://astro.build) marketing site for the Family Asset Vault product.
Decoupled from the app, deploys to **Cloudflare Pages or Vercel free tier ($0 hosting)**.

Built for **ARY-26**. The brand name + domain are **provisional, pending board approval
59f8fc72** (ARY-17). The whole site is brand-agnostic so confirming the brand is a one-file edit.

## Quick start

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # → dist/  (static)
npm run preview  # serve the built site
```

## ✅ Go-live checklist (after board approval)

1. **Brand/domain** → edit `src/config/brand.ts`:
   - set `provisional: false`
   - set `name`, `shortName`, `domain`, `url`, `email.*` to the approved values
   - (the provisional banner + footer note disappear automatically)
2. **Trust copy (CMO C1)** → replace placeholder bodies in `src/pages/security.astro`
   and `src/pages/privacy.astro` (remove the editor-note boxes).
3. **Blog cornerstones (CMO C2)** → drop Markdown files into `src/content/blog/`
   (see `how-to-inventory-family-assets.md` for the frontmatter shape); delete the seed.
4. **ESP + analytics** → set vars from `.env.example` in the host's build env:
   - `PUBLIC_ESP_ENDPOINT` (waitlist POST `{ email }`) — Resend / MailerLite
   - `PUBLIC_ANALYTICS_DOMAIN` / `PUBLIC_ANALYTICS_SRC` (Plausible / Cloudflare)
5. **DNS / email** → SPF/DKIM/DMARC + inbox (tracked under the DNS/email child issue, ARY-27).
6. `npm run build` → deploy `dist/`.

## What's wired

- Landing: hero, 3 value pillars, capture demo, advisory teaser, trust strip, waitlist CTA.
- `/security`, `/privacy` (honest, code-grounded placeholders — see §10 guardrails).
- `/blog` content collection + post route + one template article.
- SEO: canonical URLs, sitemap, robots, OG/Twitter cards, semantic headings.
- Waitlist form posts to a configurable ESP; runs in "preview mode" with no endpoint set.

## Guardrails (do not violate)

Trust copy must stay within **shipped** capabilities (ARY-17 §10): OK to say *per-user data
isolation, consent-based & revocable sharing, audit trail, scrypt password hashing, we don't
sell your data*. **NOT OK** until the code/audits support it: encryption-at-rest,
"bank-/military-grade" encryption, SOC 2 / ISO certification.

## Deploy

- **Cloudflare Pages**: build `npm run build`, output `dist`. `public/_headers` applies security headers.
- **Vercel**: framework preset Astro, output `dist` (or use `vercel.json`).
