import { readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { BRAND } from './src/config/brand';
import { LOCALES, DEFAULT_LOCALE } from './src/config/i18n';

// Blog articles use TRANSLATED slugs (ARY-523), so the sitemap's prefix-based
// i18n pairing can't link them — `/blog/<en-slug>/` and `/pt/blog/<pt-slug>/`
// don't share a path. We inject the correct cross-locale `xhtml:link` alternates
// for every blog URL from the same manifest the routing uses, keyed by pathname.
const blogSlugs = JSON.parse(readFileSync(new URL('./src/i18n/blog-slugs.json', import.meta.url)));
const blogAlternatesByPath = {};
for (const slugs of Object.values(blogSlugs)) {
  const links = Object.entries(slugs).map(([loc, slug]) => ({
    lang: loc,
    url: new URL(loc === DEFAULT_LOCALE ? `/blog/${slug}/` : `/${loc}/blog/${slug}/`, BRAND.url).href,
  }));
  links.push({ lang: 'x-default', url: new URL(`/blog/${slugs[DEFAULT_LOCALE]}/`, BRAND.url).href });
  for (const l of links) {
    if (l.lang !== 'x-default') blogAlternatesByPath[new URL(l.url).pathname] = links;
  }
}

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
      // Override the prefix-derived alternates for translated-slug blog URLs
      // (ARY-523) with the manifest-correct set; leave every other page as-is.
      serialize(item) {
        const path = new URL(item.url).pathname;
        if (blogAlternatesByPath[path]) item.links = blogAlternatesByPath[path];
        return item;
      },
    }),
  ],
  build: { format: 'directory' },
});
