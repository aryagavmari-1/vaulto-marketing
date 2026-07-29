# Claims guard (ARY-1340)

The build fails if retired product claims appear in site copy.

Dead capability claims reached `/privacy` in 16 locales this month, and the manual
sweep that declared it clean still missed three more places (ARY-1260, ARY-1264,
ARY-1273). This check makes that class of regression impossible rather than
unlikely. It runs in `prebuild`, so it gates both the GitHub Actions deploy
workflow and Render's own auto-deploy — nothing reaches the site without passing.

```
npm run guard:claims    # run the banned-claims guard now
npm run claims:test     # assert every rule's mustFire / mustStayGreen controls
npm run build           # runs both automatically, before the OG render
```

`guard:claims` scans the site for retired wording. `claims:test` is a separate
meta-level check: it proves the regexes themselves fire on the real retired text
and stay green on the approved replacements. Both run in `prebuild` so a bad
regex edit is caught before deploy. The legacy `claims:check` alias still works.

## What it scans

`src/i18n` (all 16 locales), `src/content/blog`, `src/content/blog-i18n`,
`src/pages`, `src/components`, `src/layouts`, `src/config` — every `.json`,
`.md`, `.astro`, and `.ts` under them.

## Where the rules come from

**The ARY-23 §0 proof table is the single source of truth.** There is no
hand-maintained second list — that is precisely what drifted the first time.

`banned-claims.json` is **generated**. Never edit it by hand:

```
npm run claims:sync     # regenerates from ARY-23, needs PAPERCLIP_API_* (any agent run)
```

The generator reads two things from the ARY-23 `positioning-deck` document:

1. the **§0 capability table** — to see which rows are retired (❌, ⚠️, reworded,
   or struck through), and
2. a fenced ` ```claims-guard ` block directly beneath it — the machine-readable
   patterns.

It then **cross-checks the two and fails if a retired row is unaccounted for**.
That is the anti-drift property: you cannot retire a claim in §0 and silently
forget to guard it. Every retired row must be either

- a `rules` entry — a regex the build enforces, or
- a `notPatterned` entry — an explicit, written reason a regex can't express it.

### Retiring a claim

1. Update the row in ARY-23 §0 (and sweep the deck prose in the same edit — the
   standing rule in §0 applies).
2. Add its patterns to the `claims-guard` block in that same document.
3. `npm run claims:sync` and commit the regenerated `banned-claims.json`.

## Allowing a legitimate use

Some retired phrases are legitimate in other contexts. The open-banking post uses
"revocable" correctly — about tokens at *other* providers, not Vaulto sharing. An
inline marker makes that a visible decision rather than a silently weakened rule.

**In blog markdown, put the marker in the frontmatter as a YAML `#` comment:**

```yaml
---
title: "..."
draft: false
# claims-allow: revocable-sharing — this post discusses revoking open-banking
# access at OTHER providers, never Vaulto sharing (C-003).
---
```

Cite the immutable claim id (`C-003`). The legacy `§0 row N` numbering was
retired by [ARY-1338](/ARY/issues/ARY-1338) and must not be cited.

⚠️ **Do not use an HTML comment in the post body.** Astro emits `<!-- ... -->`
straight into the rendered page, so the marker — which quotes the retired claim
and explains why we can't make it — ends up in the public HTML source. Verified:
a body marker showed up in `dist/blog/.../index.html`; the frontmatter one does
not. Frontmatter is stripped at build time, which is what we want.

⚠️ **The same applies to `.astro`.** An HTML comment in an `.astro` template
ships to the reader just as a markdown-body one does — `src/layouts/Base.astro`
has one, and it renders into all 226 pages. In `.astro`, put the marker in the
`---` component-script fence as a `//` comment. Markers in `.ts` and `.json`
(via a `_comment` key) are safe; nothing in those surfaces reaches the reader.

- The marker exempts **that rule id, in that file only**.
- The reason is **mandatory** (12+ chars) — a bare suppression is a build error.
- Every exemption is printed on each run, so they stay reviewable.
- The marker works in any file the guard scans, but always pick a form the build
  strips: frontmatter `#` in markdown, `//` or `/* */` in `.ts`, and the
  `---`-fenced script block (not the template) in `.astro`. In JSON, add it as a
  sibling `"_claimsAllow"` string and check it isn't rendered by a template.
- A marker that matches nothing is reported so it can be removed.

## Known limits — this is a grep, not a reviewer

Be honest about what it does not do. It is a cheap backstop under Brand & Trust
review, never a replacement for it.

- **English patterns only.** Translated copy carries the same claim in 15 other
  languages and the regexes will not see it. This is not theoretical: the stale
  `/features` export claim was caught in `en.json` and had to be removed from 15
  more locales by hand. English is the canonical source (see `I18N.md`), so
  catching it in `en.json` stops it *propagating* — but a claim retired after a
  translation already shipped needs a manual sweep of the locale files.
- **Phrases, not capabilities.** It matches wording. A new sentence that implies
  a dead capability without using the retired words passes. Grep the capability,
  not just the phrase.
- **Some rows can't be regexed.** "zero-knowledge" and "bank-grade" appear
  legitimately and often as *denials* in our honesty copy ("we deliberately do
  not claim..."), in all 16 locales. Banning the string would fire on the honest
  disclaimer far more than on a real over-claim — worse than nothing. Those rows
  are listed in `notPatterned` with their reasons and stay with human review.
- **A stale rule set is a silent guard.** If `banned-claims.json` is more than 90
  days old the check warns (it does not fail — a missed regeneration should never
  block a deploy on its own).
