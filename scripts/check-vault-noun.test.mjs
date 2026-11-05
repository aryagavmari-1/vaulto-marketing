#!/usr/bin/env node
// Controls for the vault-noun gate itself (ARY-4258).
//
// The defect this file exists to prevent is not a wrong noun reaching a page — that
// is what check-vault-noun.mjs is for. It is a *check that cannot fire*. The ARY-1389
// ruling was re-discovered four times precisely because "applied" meant "applied
// where someone happened to look", and a gate that silently matches nothing recreates
// exactly that failure while looking green.
//
// So every check gets both directions, driven through the pure `checkLocale`: the
// approved fixture must produce zero problems, and a hand-built violation must
// produce that specific problem code. Run by `prebuild` ahead of the gate — a check
// that stops firing fails the deploy instead of going quiet.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { LEXICON, CONTENT, checkLocale, checkLexicon, flatten, mask, EN_NOUN } from './check-vault-noun.mjs';

let failed = 0;
let checked = 0;

const assert = (label, ok, detail = '') => {
  checked += 1;
  if (ok) return;
  failed += 1;
  console.error(`  ✖ ${label}${detail ? ` — ${detail}` : ''}`);
};

const codes = (problems) => problems.map((p) => p.match(/^\[([a-z-]+)\]/)?.[1]);

console.log('vault-noun gate controls (ARY-4258)\n');

// 0. The lexicon self-check must be clean, or nothing below means anything.
assert('lexicon self-check is clean', checkLexicon().length === 0, checkLexicon().join('; '));

// A field EN anchors on the noun, plus one it does not.
const EN = { 'cta.startVault': 'Start your vault — free', 'nav.home': 'Home' };

for (const loc of Object.keys(LEXICON)) {
  const { app, stem, retired } = LEXICON[loc];

  // Baseline: a fixture using the app noun is silent. Without this, an over-broad
  // check would "pass" every negative control below while flagging correct copy.
  assert(
    `${loc} approved fixture is clean`,
    checkLocale('chrome', loc, EN, { 'cta.startVault': `… ${app} …`, 'nav.home': 'x' }).length === 0,
    JSON.stringify(checkLocale('chrome', loc, EN, { 'cta.startVault': `… ${app} …`, 'nav.home': 'x' }))
  );

  // 1. POSITIVE fires: EN names the vault, the locale does not.
  const missing = checkLocale('chrome', loc, EN, { 'cta.startVault': 'rien du tout', 'nav.home': 'x' });
  assert(`${loc} missing-noun fires`, codes(missing).includes('missing-noun'), JSON.stringify(missing));

  // 2. DENYLIST fires: a retired noun anywhere, including in a field EN does not
  //    anchor (nav.home) — this is the reach that catches an unlooked-at surface.
  for (const r of retired) {
    const hit = checkLocale('chrome', loc, EN, { 'cta.startVault': `… ${app} …`, 'nav.home': `… ${r} …` });
    assert(
      `${loc} retired-noun "${r}" fires in an EN-unanchored field`,
      codes(hit).includes('retired-noun'),
      JSON.stringify(hit)
    );
  }

  // 3. The stem must survive inflection, not just the dictionary form.
  assert(`${loc} stem "${stem}" matches app noun "${app}"`, mask(app).toLowerCase().includes(stem));
}

// 4. Deny-by-default: an unknown locale is a failure, never a silent skip.
const unknown = checkLocale('chrome', 'xx', EN, { 'cta.startVault': 'whatever' });
assert('unknown locale fails closed', codes(unknown).includes('lexicon'), JSON.stringify(unknown));

// 5. Brand masking: "Family Asset Vault" / "Vaulto" must not read as the common noun,
//    in either direction. A brand-only EN field must not pull the whole corpus into
//    scope, and a locale field that only says "Vaulto" must not count as naming it.
assert(
  'brand-only EN field is not in positive scope',
  checkLocale('chrome', 'fr', { k: 'Family Asset Vault and Vaulto' }, { k: 'rien' }).length === 0
);
assert(
  'brand-only locale value does not satisfy the positive check',
  codes(checkLocale('chrome', 'fr', EN, { 'cta.startVault': 'Vaulto' })).includes('missing-noun')
);
assert('EN_NOUN ignores Vaulto', !EN_NOUN.test(mask('Vaulto')));
assert('EN_NOUN catches the bare noun', EN_NOUN.test(mask('your vault here')));

// 6. The derivation is non-empty on the real tree. If `en.json` stopped carrying the
//    noun — a rename, a restructure — the positive check would match nothing and this
//    gate would go quiet while looking green. That is the ARY-1516 dead-code failure.
const read = (f) => flatten(JSON.parse(readFileSync(f, 'utf8')));
const surfaces = readdirSync(CONTENT, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(CONTENT, d.name, 'en.json')))
  .map((d) => d.name);
let derived = 0;
for (const s of surfaces)
  derived += Object.values(read(join(CONTENT, s, 'en.json'))).filter((v) => EN_NOUN.test(mask(v))).length;
assert(`positive check derives a non-empty scope (got ${derived})`, derived > 0);

// 7. Every locale that ships content is in the lexicon — the live coverage claim.
const shipped = new Set();
for (const s of surfaces)
  for (const f of readdirSync(join(CONTENT, s)))
    if (f.endsWith('.json') && f !== 'en.json') shipped.add(basename(f, '.json'));
const uncovered = [...shipped].filter((l) => !LEXICON[l]);
assert(`every shipped locale has a lexicon entry`, uncovered.length === 0, uncovered.join(','));

// 8. The lexicon is mirrored in three places — this gate, the translation prompt
//    (scripts/translate.mjs VAULT_NOUN) and I18N.md. The prompt mirror is the one
//    that matters most: if it drifts, the next `--force` re-translation reintroduces
//    the retired noun across up to 15 locales and the gate then blocks the build on
//    copy nobody edited by hand. That is how the ARY-431 pt register fix was lost.
const pipeline = readFileSync(new URL('./translate.mjs', import.meta.url), 'utf8');
const pinned = {};
const block = pipeline.match(/const VAULT_NOUN = \{([\s\S]*?)\};/);
assert('translate.mjs still defines VAULT_NOUN', Boolean(block));
if (block) {
  for (const m of block[1].matchAll(/(\w{2}):\s*'([^']+)'/g)) pinned[m[1]] = m[2];
  for (const [loc, { stem, app }] of Object.entries(LEXICON)) {
    const p = pinned[loc];
    assert(`${loc} is pinned in the translation prompt`, Boolean(p));
    if (p)
      assert(
        `${loc} prompt noun "${p}" satisfies the gate stem "${stem}" (app: "${app}")`,
        p.toLowerCase().includes(stem) || stem.includes(p.toLowerCase())
      );
  }
  const extra = Object.keys(pinned).filter((l) => !LEXICON[l]);
  assert('translation prompt pins no locale the gate does not know', extra.length === 0, extra.join(','));
}

// And the retired lists must agree, so the prompt never invites what the gate blocks.
const retiredBlock = pipeline.match(/const VAULT_NOUN_RETIRED = \{([\s\S]*?)\};/);
assert('translate.mjs still defines VAULT_NOUN_RETIRED', Boolean(retiredBlock));
if (retiredBlock) {
  for (const m of retiredBlock[1].matchAll(/(\w{2}):\s*\[([^\]]*)\]/g)) {
    const loc = m[1];
    const listed = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1].toLowerCase());
    const gateRetired = (LEXICON[loc]?.retired || []).map((r) => r.toLowerCase());
    for (const r of listed)
      assert(
        `${loc} prompt-retired "${r}" is also retired in the gate`,
        gateRetired.some((g) => g.includes(r) || r.includes(g))
      );
  }
}

// 9. I18N.md must document the ruling — the layer a human reads before editing copy.
const doc = readFileSync(new URL('../I18N.md', import.meta.url), 'utf8');
assert('I18N.md documents the vault noun', /## The vault noun/.test(doc));
for (const [loc, { app }] of Object.entries(LEXICON))
  assert(`I18N.md names the ${loc} noun "${app}"`, doc.includes(app));

console.log(
  failed
    ? `\n✗ ${failed} of ${checked} controls failed.\n`
    : `\n✓ ${checked} controls pass — the gate fires in both directions across ${Object.keys(LEXICON).length} locales.\n`
);
process.exit(failed ? 1 : 0);
