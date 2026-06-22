/**
 * Rasterizes the brand OG card SVG → a 1200×630 PNG (ARY-449 P0 #1).
 *
 * Facebook / Twitter / LinkedIn / iMessage do not render SVG OG images, so the
 * default share card MUST be a PNG. `public/og.svg` stays the editable source of
 * truth; this script bakes `public/og.png` from it. Run via `pnpm og` (also wired
 * into `prebuild`) so the PNG can never drift from the SVG.
 *
 * Uses `sharp` (already a transitive Astro dep) — no new dependency.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const svgPath = fileURLToPath(new URL('../public/og.svg', import.meta.url));
const pngPath = fileURLToPath(new URL('../public/og.png', import.meta.url));

const svg = readFileSync(svgPath);
const png = await sharp(svg, { density: 200 })
  .resize(1200, 630, { fit: 'cover' })
  .png()
  .toBuffer();
writeFileSync(pngPath, png);
console.log(`og.png written (${png.length} bytes, 1200×630)`);
