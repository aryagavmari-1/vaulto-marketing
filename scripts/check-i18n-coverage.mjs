#!/usr/bin/env node
/**
 * i18n coverage guard (ARY-1441).
 *
 * `getContent` deep-merges a locale overlay over English and falls back per-key,
 * so a key that exists in `<group>/en.json` but is MISSING from a locale file
 * silently renders in English on the localized page — no blank, no build error.
 * That fallback is deliberate (a half-translated locale never ships an empty
 * string), but it means a whole block can be added to English and never
 * translated, and nothing catches it. ARY-1441 was exactly that: `finalCta` was
 * added to `security/en.json` and `planning/en.json` and left untranslated in all
 * 15 locales, so every localized /security and /planning page rendered its
 * closing call-to-action in English — right where the conversion CTA sits.
 *
 * This guard fails when a key present in `<group>/en.json` is absent from EVERY
 * non-English locale of that group (an all-missing "silent hole"). It does NOT
 * fail on a key missing from *some* locales — that is the legitimate
 * partial-translation state the fallback exists to cover; those are reported as
 * warnings only.
 *
 * Usage:  node scripts/check-i18n-coverage.mjs
 * Also runs in `prebuild`, so a fully-untranslated key can't reach a build.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const CONTENT_DIR = join(ROOT, 'src/i18n/content');

const LOCALES = ['ar', 'de', 'es', 'fr', 'hi', 'it', 'ja', 'ko', 'nl', 'pl', 'pt', 'ru', 'sv', 'tr', 'zh'];

/** Every leaf path in a content blob, e.g. `finalCta.title`, `protections[2].body`. */
const leaves = (node, prefix = '', out = []) => {
  if (Array.isArray(node)) node.forEach((v, i) => leaves(v, `${prefix}[${i}]`, out));
  else if (node && typeof node === 'object')
    for (const [k, v] of Object.entries(node)) leaves(v, prefix ? `${prefix}.${k}` : k, out);
  else out.push(prefix);
  return out;
};

const load = (f) => new Set(leaves(JSON.parse(readFileSync(f, 'utf8'))));

const groups = readdirSync(CONTENT_DIR).filter((d) => statSync(join(CONTENT_DIR, d)).isDirectory());

let allMissing = 0;
let partial = 0;
for (const g of groups) {
  const en = join(CONTENT_DIR, g, 'en.json');
  if (!existsSync(en)) continue;
  const enKeys = load(en);
  const have = LOCALES.filter((l) => existsSync(join(CONTENT_DIR, g, `${l}.json`)));
  if (!have.length) continue;
  const sets = Object.fromEntries(have.map((l) => [l, load(join(CONTENT_DIR, g, `${l}.json`))]));

  for (const k of enKeys) {
    const missing = have.filter((l) => !sets[l].has(k));
    if (missing.length === have.length) {
      allMissing++;
      console.error(`✖ ${g}: "${k}" is in en.json but MISSING from all ${have.length} locales → renders English everywhere.`);
    } else if (missing.length) {
      partial++;
      console.warn(`· ${g}: "${k}" missing from ${missing.length}/${have.length} locales (${missing.join(', ')}) — English fallback, review.`);
    }
  }
}

if (allMissing) {
  console.error(
    `\ni18n coverage check FAILED — ${allMissing} key(s) translated in ZERO locales.\n` +
      'Each renders English on every localized page. Translate it into the locale files\n' +
      'under src/i18n/content/<group>/, or remove it from en.json if it should not ship.\n',
  );
  process.exit(1);
}
console.log(
  `i18n coverage check passed — no all-missing keys across ${groups.length} content groups` +
    (partial ? ` (${partial} partial key(s) on English fallback — see warnings above).` : '.'),
);
