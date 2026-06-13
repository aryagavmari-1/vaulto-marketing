import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { BRAND } from './src/config/brand';

// Static output — deploys to Cloudflare Pages / Vercel free tier ($0 hosting).
// `site` drives canonical URLs, sitemap, and og:url. It reads from the single
// brand config so flipping the domain is a one-line change post-approval.
export default defineConfig({
  site: BRAND.url,
  integrations: [sitemap()],
  build: { format: 'directory' },
});
