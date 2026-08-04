# Vaulto Calm — $0 social-graphic renderer (ARY-528)

Programmatic, repeatable, **zero-dollar / zero-new-dependency** renderer that turns a
social-repurpose draft into an on-brand PNG. It implements the ARY-527 design spec
(`#document-design-spec`) and feeds the weekly repurpose pipeline (ARY-516).

No design SaaS, no paid fonts, no stock. Inter is OFL-licensed (bundled in `fonts/`).
Rendering uses the **system Google Chrome** in headless mode — the only thing that
renders HTML/CSS + `@font-face` exactly — so the Astro site build is untouched. This is
an **on-demand batch tool**, not part of `astro build`.

## Run

```bash
node render.mjs              # render every asset in assets.json → out/*.png + out/gallery.html
node render.mjs --only pin-p7
node render.mjs --list
```

Chrome is auto-detected (macOS / Linux paths); override with `CHROME_BIN=/path/to/chrome`.

## Files

| File | Role |
|---|---|
| `social.css` | The token + component contract. Canonical **olive** Vaulto Calm tokens (mirrors `vault-mobile/constants/tokens.ts`). `[data-theme="calm"]` suppresses terracotta automatically (spec §6). |
| `render.mjs` | The engine: block renderers, per-format canvas/type scale, headless-Chrome screenshot, gallery writer, **guardrails in code**. |
| `assets.json` | The 44 asset records (the spec §5 contract), authored from ARY-517's claim-QA'd drafts. |
| `fonts/inter-*.woff2` | Inter 400/600/700/800, latin subset, OFL — $0. |
| `out/*.png` | Rendered graphics at exact dimensions. |
| `out/gallery.html` | All assets at a glance (open in a browser). |

## The asset record (spec §5)

```jsonc
{ "id": "pin-p7",
  "format": "pin" | "liCard" | "liSquare" | "video",
  "theme":  "neutral" | "calm",          // calm ⇒ terracotta fully suppressed
  "block":  "title" | "checklist" | "steps" | "stat" | "split",
  "variant": "end",                       // video end/CTA card (optional)
  "tag": "Estate planning",               // topic kicker
  "headline": "Five things your family needs in one place",
  "subhead": "…",                         // optional
  "items": ["…"],                          // checklist / steps (≤6, enforced)
  "stat": "OWN − OWE = NET WORTH",         // stat block
  "panels": [{ "label": "…", "text": "…" }], // split block
  "cta": "Get the checklist",              // video end card
  "warn": true, "disclaimer": true }       // ⚠ estate/insurance/tax → ribbon required
```

## Formats (spec §3)

| format | dimensions | use |
|---|---|---|
| `pin` | 1000×1500 | Pinterest pin (full block system + keyline frame) |
| `liCard` | 1200×627 | LinkedIn link / OG card (headline + wordmark) |
| `liSquare` | 1080×1080 | LinkedIn square (full block system) |
| `video` | 1080×1920 | Short-form hook card / `variant:"end"` CTA card (9:16 platform-UI safe zones) |

## Guardrails enforced in code (spec §5/§6)

- **`items` cap = 6** → throws (Miller's Law + canvas height).
- **⚠ asset without `disclaimer:true`** → throws (refuse to emit).
- **Headline overflow at the format's min size** → **fail-loud throw**, not silent shrink —
  it's a copy-length signal back to ARY-517.
- **`theme:"calm"`** gates terracotta back to olive everywhere (no bright accent on sensitive topics).

## Wiring into the weekly pipeline (ARY-516 / CMO ARY-529)

Each repurpose cycle, append/update `assets.json` from the cycle's drafts doc and run
`node render.mjs`. The PNGs in `out/` are the cycle's graphics; `gallery.html` is the review
sheet. Per-pin alt text already lives in the ARY-517 drafts and threads into the published
asset's alt field at post time.
