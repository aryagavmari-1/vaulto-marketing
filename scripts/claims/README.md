# Claims guard (ARY-1340)

The build fails if retired product claims appear in site copy.

Dead capability claims reached `/privacy` in 16 locales this month, and the manual
sweep that declared it clean still missed three more places (ARY-1260, ARY-1264,
ARY-1273). This check makes that class of regression impossible rather than
unlikely **for English copy**. It runs in `prebuild`, so it gates both the
GitHub Actions deploy workflow and Render's own auto-deploy — nothing reaches
the site without passing. The rule patterns are English-only, so a green run is
necessary but **not sufficient** for the other 15 locales — see
[Locale coverage](#locale-coverage) before citing this guard as coverage.

```
npm run guard:claims       # scan the site for retired wording
npm run guard:claims:test  # assert every rule's mustFire / mustStayGreen controls
npm run build              # runs both automatically, before the OG render
```

`guard:claims` scans the site. `guard:claims:test` is the meta-level check: it
proves the regexes themselves still fire on the real retired text and stay green
on the approved replacements. A guard reporting "0 findings" is indistinguishable
from a guard that stopped matching, so `prebuild` runs the controls **first** —
a bad regex edit fails the deploy instead of going quiet.

## What it scans

`src/i18n` (all 16 locales), `src/content/blog`, `src/content/blog-i18n`,
`src/pages`, `src/components`, `src/layouts`, `src/config` — every `.json`,
`.md`, `.astro`, and `.ts` under them.

## Locale coverage

**The scanner reads all 16 locales; the rule patterns only match English.** It
walks the localised `src/i18n` JSON, but every regex in `banned-claims.json` is
written against English words, so it can only fire on English strings. A retired
claim living in a translated field passes green even though the same claim in
`en` would fail.

Measured, not assumed (ARY-1523, verified at `3977def`): of the 16 retired
strings the ARY-1394 trust-band delta removed, `visibility-absolute` catches
**1** — `en`. The `es`/`ja`/`pt`/… paraphrases (`solo puedes ver y editar la
tuya`, `表示や編集ができるのは、あなた自身の金庫だけです`, …) share no root with the English pattern
and are invisible to it. Each rule states its own reach in a `knownGap` field;
read it before treating a rule as multilingual.

**What actually covers the other 15 locales** is a per-locale *field* check, not
more regexes — each governed field (`trustBand.proof[3]`, `protections[-1]`, …)
has exactly one approved value per locale, so the gate asserts the live value
equals the approved one rather than trying to describe every wrong phrasing in
every language. For the C-002 trust band that gate is `guard:trustband`
(`scripts/check-trust-band.mjs`), which ARY-1516 pinned to literals and wired
into `prebuild` — it replaced `scripts/ary1475-verify.py`, which read its own
reference out of git at the same rev and had therefore been red at
`origin/master` since ARY-1481 without anyone seeing it. The durable, general
per-locale field check is tracked on ARY-1377.

So: **do not cite `guard:claims` / `check-claims.mjs` as evidence for non-English
copy.** It is the English backstop. The field gate is the locale-complete
control.

> Script names (ARY-1577). `claims:check` and `check:claims` used to be two
> different guards distinguished only by word order, which had already caused one
> mis-scoped statement. The unambiguous names are now:
>
> | script | runs | what it guards |
> |---|---|---|
> | `guard:claims` | `check-claims.mjs` | retired claims in English copy |
> | `guard:claims:test` | `claims/rules.test.mjs` | the banned-claims rules themselves |
> | `guard:tier` | `check-tier-claims.mjs` | free-vs-paid tier boundary (ARY-1506) |
> | `guard:tier:test` | `check-tier-claims.test.mjs` | the tier guard itself |
> | `guard:trustband` | `check-trust-band.mjs` | the C-002 trust-band bullet + `/security` clause, 16 locales (ARY-1516) |
> | `guard:trustband:test` | `check-trust-band.test.mjs` | the trust-band gate itself |
>
> `claims:check`, `check:claims` and `test:claims` still work as aliases for one
> release. Prefer the `guard:*` names — and note the alias set is why the controls
> runner is **not** called `claims:test`, which would have collided with the
> existing `test:claims` in exactly the same reversed-word-order way.

### Rules without controls

`guard:claims:test` names every rule that carries no `controls` block rather than
skipping it silently — a silent skip reads as coverage. Those rules predate the
harness; **9 of 13 are still uncovered**, so the controls prove the four rules
they cover and say nothing about the rest. Writing the missing ones needs the real
retired and approved wording out of ARY-23 §0, which is a Brand & Trust call, not
a mechanical one (tracked as a follow-up on ARY-1577). Add `controls` to a rule
when you next touch it.

## Where the rules come from

**The ARY-23 §0 proof table is the single source of truth.** There is no
hand-maintained second list — that is precisely what drifted the first time.

`banned-claims.json` is **generated**. Never edit it by hand:

```
npm run claims:sync     # regenerates from ARY-23, needs PAPERCLIP_API_* (any agent run)
```

⚠️ **`banned-claims.json` is generated — never hand-edit it.** Rules *and* their
`guidance` belong in the `claims-guard` block in ARY-23 §0.1; anything written
only into this file is deleted by the next sync. That is not hypothetical: the
ARY-1533 ruling — a false positive cleared three separate times — lived only in
the generated file for two months ([ARY-4240](/ARY/issues/ARY-4240)). A sync
that would shorten a rule's `label`, `guidance` or `instead` now fails and
prints the text it would lose; pass `--allow-prose-loss` if the removal is
deliberate.

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
