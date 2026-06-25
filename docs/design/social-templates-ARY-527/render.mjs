/**
 * Vaulto Calm — $0 social-graphic renderer (ARY-528).
 *
 * Turns a draft record (the ARY-527 §5 contract) → an on-brand PNG, with zero
 * design SaaS, zero paid fonts/stock, and ZERO new npm dependencies. It drives the
 * system Google Chrome in headless mode (the marketing stack already rasterizes via
 * sharp; Chrome is the only thing that renders HTML/CSS + @font-face exactly), so the
 * website build is untouched — this is an on-demand batch tool for the weekly
 * social-repurpose pipeline (ARY-516).
 *
 *   node render.mjs                 # render every asset in assets.json → out/*.png + gallery.html
 *   node render.mjs --only pin-p7   # render a single asset by id
 *   node render.mjs --list          # list asset ids without rendering
 *
 * Chrome binary resolution order: $CHROME_BIN → common macOS/Linux paths.
 *
 * Guardrails enforced IN CODE (spec §5/§6), not by convention:
 *   • items ≤ 6                       → throws (Miller's Law / canvas height)
 *   • ⚠ asset without disclaimer:true  → throws (refuse to emit)
 *   • headline overflow at min size    → throws fail-loud (copy-length signal back to ARY-517)
 *   • theme:"calm" suppresses terracotta entirely (handled by social.css [data-theme])
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const CSS_PATH = join(HERE, 'social.css');

// ---- Chrome binary ----------------------------------------------------------
function resolveChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean);
  for (const c of candidates) { try { if (existsSync(c)) return c; } catch {} }
  throw new Error('No Chrome/Chromium found. Set $CHROME_BIN to a Chrome executable.');
}
const CHROME = resolveChrome();

// ---- Per-format canvas + type scale (spec §3) -------------------------------
const FORMATS = {
  pin:      { w: 1000, h: 1500, pad: 80, keyline: true,  hMax: 80, hMin: 64, sub: 33, item: 38, tag: 28, name: 40, domain: 28, mark: 56, gap: 30, listGap: 22 },
  liCard:   { w: 1200, h: 627,  pad: 72, keyline: false, hMax: 58, hMin: 48, sub: 28, item: 32, tag: 22, name: 34, domain: 24, mark: 48, gap: 22, listGap: 16, headlineOnly: true },
  liSquare: { w: 1080, h: 1080, pad: 88, keyline: false, hMax: 62, hMin: 54, sub: 30, item: 38, tag: 24, name: 38, domain: 26, mark: 50, gap: 26, listGap: 20 },
  video:    { w: 1080, h: 1920, padX: 96, padTop: 230, padBottom: 330, keyline: false, hMax: 96, hMin: 72, sub: 40, item: 40, tag: 30, name: 44, domain: 28, mark: 96, gap: 34, listGap: 24, payoff: 64, cta: 40, onscreen: 72 },
};

const DISCLAIMER = 'Rules vary by country; general information, not legal or financial advice.';

// ---- SVG marks --------------------------------------------------------------
const KEYHOLE = (s) => `<svg width="${s}" height="${s}" viewBox="0 0 48 48" fill="none">
  <circle cx="24" cy="20" r="6.4" fill="#FBFAF6"/>
  <path d="M20.7 24.5h6.6l1.8 9.2a1.6 1.6 0 0 1-1.57 1.9h-7.04a1.6 1.6 0 0 1-1.57-1.9z" fill="#FBFAF6"/>
</svg>`;
const CHECK = (s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.2 4.2L19 7" stroke="#FBFAF6" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---- Block renderers (spec §2) ---------------------------------------------
function renderBlock(a, f) {
  switch (a.block) {
    case 'checklist': {
      const d = Math.round(f.item * 1.35);
      const rows = a.items.map((t) => `
        <div class="row" style="gap:${Math.round(f.item*0.5)}px">
          <span class="tick" style="width:${d}px;height:${d}px">${CHECK(Math.round(d*0.62))}</span>
          <span class="row-text" style="font-size:${f.item}px">${esc(t)}</span>
        </div>`).join('');
      return `<div class="block" style="gap:${f.listGap}px;margin-top:${f.gap}px">${rows}</div>`;
    }
    case 'steps': {
      const d = Math.round(f.item * 1.35);
      const rows = a.items.map((t, i) => `
        <div class="row" style="gap:${Math.round(f.item*0.5)}px">
          <span class="step-num" style="width:${d}px;height:${d}px;font-size:${Math.round(f.item*0.82)}px">${i + 1}</span>
          <span class="row-text" style="font-size:${f.item}px">${esc(t)}</span>
        </div>`).join('');
      return `<div class="block" style="gap:${f.listGap}px;margin-top:${f.gap}px">${rows}</div>`;
    }
    case 'stat': {
      const statSize = Math.round(f.hMax * 1.15);
      const html = esc(a.stat || a.headline).replace(/−|−|-/g, (m) => `<span class="op">${m}</span>`);
      return `<div class="block" style="margin-top:${f.gap}px"><div class="stat" style="font-size:${statSize}px">${html}</div></div>`;
    }
    case 'split': {
      const panels = a.panels.map((p) => `
        <div class="panel" style="padding:${Math.round(f.item*0.7)}px ${Math.round(f.item*0.8)}px">
          <div class="panel-label" style="font-size:${Math.round(f.item*0.6)}px;margin-bottom:${Math.round(f.item*0.25)}px">${esc(p.label)}</div>
          <div class="panel-text" style="font-size:${f.item}px">${esc(p.text)}</div>
        </div>`).join('');
      return `<div class="block" style="gap:${f.listGap}px;margin-top:${f.gap}px">${panels}</div>`;
    }
    default:
      return '';
  }
}

function wordmark(f, centered = false) {
  return `<div class="wordmark" style="gap:${Math.round(f.mark*0.32)}px${centered ? ';justify-content:center' : ''}">
    <span class="mark" style="width:${f.mark}px;height:${f.mark}px;border-radius:${Math.round(f.mark*0.28)}px">${KEYHOLE(Math.round(f.mark*0.9))}</span>
    <span class="words" style="gap:${Math.round(f.domain*0.18)}px">
      <span class="name" style="font-size:${f.name}px">Vaulto</span>
      <span class="domain" style="font-size:${f.domain}px">myvaulto.com</span>
    </span>
  </div>`;
}

function disclaimer(f) {
  const s = Math.round(f.domain * 0.86);
  const ic = Math.round(s * 1.5);
  return `<div class="disclaimer" style="font-size:${s}px;gap:${Math.round(s*0.55)}px;margin-bottom:${f.gap}px">
    <span class="i" style="width:${ic}px;height:${ic}px;font-size:${Math.round(ic*0.62)}px">i</span>
    <span>${DISCLAIMER}</span>
  </div>`;
}

// ---- Page builder -----------------------------------------------------------
function buildHTML(a) {
  const f = FORMATS[a.format];
  if (!f) throw new Error(`[${a.id}] unknown format "${a.format}"`);

  // Guardrails (spec §5/§6) — fail in code, not by convention.
  if (a.items && a.items.length > 6) throw new Error(`[${a.id}] items=${a.items.length} exceeds cap of 6 (spec §5).`);
  if (a.warn && a.disclaimer !== true) throw new Error(`[${a.id}] ⚠-flagged asset must set disclaimer:true (spec §5).`);

  const theme = a.theme === 'calm' ? 'calm' : 'neutral';
  const tag = a.tag ? `<div class="tag" style="font-size:${f.tag}px;padding:${Math.round(f.tag*0.5)}px ${Math.round(f.tag*0.9)}px">${esc(a.tag)}</div>` : '';
  const sub = a.subhead ? `<p class="subhead" style="font-size:${f.sub}px;margin-top:${Math.round(f.gap*0.7)}px">${esc(a.subhead)}</p>` : '';
  const disc = a.disclaimer ? disclaimer(f) : '';

  let inner, contentStyle, contentClass = 'content';

  if (a.format === 'video' && a.variant === 'end') {
    // Centered end / CTA card
    contentClass = 'content center';
    contentStyle = `padding:${f.padTop}px ${f.padX}px ${f.padBottom}px`;
    inner = `
      ${wordmark(f, true)}
      <div class="spacer" style="max-height:${Math.round(f.gap*1.5)}px"></div>
      ${tag}
      <h1 class="headline" data-fit style="font-size:${f.payoff}px;margin-top:${f.gap}px">${esc(a.headline)}</h1>
      ${a.cta ? `<div class="cta" style="font-size:${f.cta}px;padding:${Math.round(f.cta*0.6)}px ${Math.round(f.cta*1.4)}px;margin-top:${Math.round(f.gap*1.4)}px">${esc(a.cta)}</div>` : ''}
      <div class="spacer"></div>
      ${a.disclaimer ? disclaimer(f) : ''}`;
  } else if (a.format === 'video') {
    // Hook card — headline anchored to top safe zone; mid kept clear for live subject.
    contentStyle = `padding:${f.padTop}px ${f.padX}px ${f.padBottom}px`;
    inner = `
      ${tag}
      <h1 class="headline" data-fit style="font-size:${f.hMax}px;margin-top:${f.gap}px;line-height:1.04">${esc(a.headline)}</h1>
      <div class="spacer"></div>
      ${a.onscreen ? `<div class="onscreen" style="font-size:${f.onscreen}px;margin-bottom:${f.gap}px">${esc(a.onscreen)}</div>` : ''}
      ${disc}`;
  } else if (f.headlineOnly) {
    // LinkedIn link / OG card — headline + wordmark only (short canvas).
    contentStyle = `padding:${f.pad}px`;
    inner = `
      ${tag}
      <h1 class="headline" data-fit style="font-size:${f.hMax}px;margin-top:${f.gap}px">${esc(a.headline)}</h1>
      ${disc}
      <div class="spacer"></div>
      ${wordmark(f)}`;
  } else {
    // pin / liSquare — full block system.
    contentStyle = `padding:${f.pad}px`;
    inner = `
      ${tag}
      <h1 class="headline" data-fit style="font-size:${f.hMax}px;margin-top:${f.gap}px">${esc(a.headline)}</h1>
      ${sub}
      ${renderBlock(a, f)}
      <div class="spacer"></div>
      ${disc}
      ${wordmark(f)}`;
  }

  const frame = f.keyline ? '<div class="frame"></div>' : '';
  const hMin = (a.format === 'video' && a.variant === 'end') ? Math.round(f.payoff * 0.8) : f.hMin;

  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="../social.css">
<style>html,body{margin:0}.canvas{width:${f.w}px;height:${f.h}px}</style>
</head><body>
<div class="canvas" data-theme="${theme}" data-format="${a.format}" data-block="${a.block || ''}">
  ${frame}
  <div class="${contentClass}" style="${contentStyle}">${inner}</div>
</div>
<script>
(async () => {
  await document.fonts.ready;
  const content = document.querySelector('.content');
  const h = document.querySelector('[data-fit]');
  const MIN = ${hMin};
  let overflow = 0;
  if (h) {
    let fs = parseFloat(getComputedStyle(h).fontSize);
    const fits = () => content.scrollHeight <= content.clientHeight + 1;
    while (!fits() && fs > MIN) { fs -= 2; h.style.fontSize = fs + 'px'; }
    document.documentElement.setAttribute('data-fit-size', String(Math.round(fs)));
    overflow = fits() ? 0 : 1;
  }
  document.documentElement.setAttribute('data-overflow', String(overflow));
})();
</script>
</body></html>`;
}

// ---- Chrome invocation ------------------------------------------------------
function chrome(args) {
  return execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--default-background-color=00000000',
    '--virtual-time-budget=4000', ...args,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
}

function renderAsset(a) {
  const f = FORMATS[a.format];
  const htmlPath = join(OUT, `${a.id}.html`);
  const pngPath = join(OUT, `${a.id}.png`);
  writeFileSync(htmlPath, buildHTML(a));
  const url = `file://${htmlPath}`;
  const win = `--window-size=${f.w},${f.h}`;

  // Pass 1 — settle fonts + auto-fit, read fail-loud + fit size from the DOM.
  const dom = chrome([win, '--dump-dom', url]);
  const of = (dom.match(/data-overflow="([01])"/) || [])[1];
  const fit = (dom.match(/data-fit-size="(\d+)"/) || [])[1];
  if (of === '1') {
    throw new Error(`[${a.id}] FAIL-LOUD: headline overflows at min ${f.hMin}px — copy too long for ${a.format} (signal back to ARY-517).`);
  }
  // Pass 2 — capture the PNG at exact W×H.
  chrome([win, `--screenshot=${pngPath}`, url]);
  return { id: a.id, format: a.format, w: f.w, h: f.h, fit: fit ? Number(fit) : null, theme: a.theme || 'neutral' };
}

// ---- Gallery ----------------------------------------------------------------
function writeGallery(results) {
  const cards = results.map((r) => `
    <figure>
      <img src="./${r.id}.png" alt="${r.id}" loading="lazy">
      <figcaption>${r.id} · ${r.w}×${r.h} · ${r.theme}${r.fit ? ` · headline ${r.fit}px` : ''}</figcaption>
    </figure>`).join('');
  writeFileSync(join(OUT, 'gallery.html'), `<!doctype html><html><head><meta charset="utf-8">
<title>Vaulto Calm — social assets (ARY-528)</title>
<style>
  body{margin:0;background:#2b2b2b;font-family:system-ui,sans-serif;color:#eee;padding:32px}
  h1{font-weight:700;font-size:22px;margin:0 0 4px}p.sub{color:#aaa;margin:0 0 28px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:28px}
  figure{margin:0}img{width:100%;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.45);background:#fff}
  figcaption{font-size:12px;color:#bbb;margin-top:8px;font-family:ui-monospace,monospace}
</style></head><body>
<h1>Vaulto Calm — social graphics (ARY-528)</h1>
<p class="sub">${results.length} assets rendered $0 from ARY-517 drafts via render.mjs. Shadows here are gallery-only.</p>
<div class="grid">${cards}</div></body></html>`);
}

// ---- Main -------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
  const assets = JSON.parse(readFileSync(join(HERE, 'assets.json'), 'utf8'));

  if (args.includes('--list')) {
    for (const a of assets) console.log(`${a.id}\t${a.format}\t${a.block || a.variant || ''}\t${a.theme || 'neutral'}`);
    return;
  }
  mkdirSync(OUT, { recursive: true });
  if (!existsSync(CSS_PATH)) throw new Error('social.css not found');

  const todo = only ? assets.filter((a) => a.id === only) : assets;
  if (only && todo.length === 0) throw new Error(`No asset with id "${only}"`);

  console.log(`Rendering ${todo.length} asset(s) with ${CHROME.split('/').pop()}…`);
  const results = [];
  const failures = [];
  for (const a of todo) {
    try {
      const r = renderAsset(a);
      results.push(r);
      console.log(`  ✓ ${r.id.padEnd(22)} ${r.w}×${r.h}  ${r.theme}${r.fit ? `  headline ${r.fit}px` : ''}`);
    } catch (e) {
      failures.push(a.id);
      console.error(`  ✗ ${a.id}: ${e.message}`);
    }
  }
  if (results.length) writeGallery(only ? JSON.parse(readFileSync(join(HERE, 'assets.json'), 'utf8')).map((a) => results.find((r) => r.id === a.id)).filter(Boolean) : results);
  console.log(`\nDone: ${results.length} rendered → out/  ${failures.length ? `| ${failures.length} FAILED: ${failures.join(', ')}` : ''}`);
  if (failures.length) process.exitCode = 1;
}

main();
