import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { BRAND } from './src/config/brand';
import { LOCALES, DEFAULT_LOCALE } from './src/config/i18n';

// Static output — deploys to Cloudflare Pages / Vercel free tier ($0 hosting).
// `site` drives canonical URLs, sitemap, and og:url. It reads from the single
// brand config so flipping the domain is a one-line change post-approval.
//
// i18n (ARY-401): localized marketing pages live under `src/pages/<locale>/`
// (English at the root, un-prefixed). Adding a translated page is purely a
// content op — routing, hreflang, and the localized sitemap derive from
// `src/config/i18n.ts`. `prefixDefaultLocale: false` keeps English URLs clean
// (`/security/`, not `/en/security/`).
export default defineConfig({
  site: BRAND.url,
  i18n: {
    locales: [...LOCALES],
    defaultLocale: DEFAULT_LOCALE,
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    // The sitemap `i18n` option makes Astro emit `xhtml:link rel="alternate"`
    // entries pairing each page with its localized siblings — the #1
    // multilingual-SEO correctness item (ARY-399 §2e). It only links locales
    // that actually have a built page, so an English-first launch stays clean.
    sitemap({
      i18n: {
        defaultLocale: DEFAULT_LOCALE,
        locales: Object.fromEntries(LOCALES.map((l) => [l, l])),
      },
    }),
  ],
  build: { format: 'directory' },
});
