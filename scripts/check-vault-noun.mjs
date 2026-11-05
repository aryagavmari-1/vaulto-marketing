#!/usr/bin/env node
/**
 * ARY-4258 — the vault-noun gate (ruling ARY-1389, lexicon ARY-1398).
 *
 * RULING: in a non-English locale, marketing copy uses THE APP'S OWN vault noun
 * (`nav.vault` in Asset-Vault `lib/i18n/src/translations.ts`) — never the English
 * word, never a transliteration of it, never a locally-nicer synonym. A CTA reading
 * "Start your Vault" that lands on a screen labelled *Tresor* breaks the seam exactly
 * where we are asking for trust.
 *
 * WHY THIS GATE EXISTS. The ruling had been "applied" four times before this file
 * (ARY-1481 → ARY-2587 /security → ARY-1516 trust band → ARY-4258) and every round
 * fixed only the surface in front of it, because nothing checked the rest. A gate
 * over a hand-written list of keys would rot the same way, so this one DERIVES its
 * scope: the fields it checks are whichever `en.json` fields carry the English noun
 * today. Add a page, or add the noun to an existing field, and that field is in scope
 * automatically — no edit here needed.
 *
 * TWO CHECKS, because neither alone is enough:
 *   1. POSITIVE (the anti-rot one) — for every `en.json` field carrying the English
 *      noun, the same field in every locale must carry that locale's app noun.
 *      Open-ended in reach, but only sees English-anchored fields.
 *   2. DENYLIST — a retired or wrong noun must not appear anywhere in that locale, in
 *      any field. Closed in reach, but sees every byte — this is what catches a wrong
 *      noun in a field whose English twin happens not to say "vault".
 *
 * Deny-by-default: a locale that ships content without a LEXICON entry is a failure,
 * not a skip.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

export const CONTENT = 'src/i18n/content';

/**
 * The app's `nav.vault`, verbatim, per locale — the single source of truth.
 *
 * `stem` is the lowercased substring that survives this language's inflection (case,
 * declension, article, compounding), because the noun is rarely quoted in dictionary
 * form mid-sentence: ru "в вашем хранилищ·е", pl "swój sejf"/"w sejf·ie".
 *
 * `retired` lists nouns ruled OUT for this locale. Keep an entry here forever once
 * added — that is what stops a regression re-landing silently years later.
 */
export const LEXICON = {
  es: { app: 'Bóveda',    stem: 'bóveda',   retired: ['baúl', 'caja fuerte'] },
  fr: { app: 'Coffre',    stem: 'coffre',   retired: ['coffre-fort', 'coffres-forts'] },
  pt: { app: 'Cofre',     stem: 'cofre',    retired: ['caixa-forte'] },
  de: { app: 'Tresor',    stem: 'tresor',   retired: ['schließfach', 'gewölbe'] },
  it: { app: 'Caveau',    stem: 'caveau',   retired: ['cassaforte'] },
  nl: { app: 'Kluis',     stem: 'kluis',    retired: [] },
  zh: { app: '保险库',     stem: '保险库',    retired: ['金库', '保管库'] },
  ja: { app: '保管庫',     stem: '保管庫',    retired: ['金庫', 'ボールト'] },
  ar: { app: 'الخزنة',     stem: 'خزن',      retired: [] },
  hi: { app: 'तिजोरी',     stem: 'तिजोर',     retired: ['वॉल्ट'] },
  ru: { app: 'Хранилище', stem: 'хранилищ', retired: ['сейф'] },
  pl: { app: 'Sejf',      stem: 'sejf',     retired: ['skarbiec', 'skarbcu', 'skarbca'] },
  tr: { app: 'Kasa',      stem: 'kasa',     retired: [] },
  ko: { app: '보관함',     stem: '보관함',    retired: ['금고'] },
  sv: { app: 'Valv',      stem: 'valv',     retired: ['kassaskåp'] },
};

/**
 * Reviewed carve-outs for the POSITIVE check, keyed `surface::path`, each with a
 * reason. A carve-out says "this field is allowed not to name the vault"; it never
 * licenses a retired noun — check 2 still applies to it.
 */
export const ALLOW = {
  'features::meta.title':
    'Localised SEO <title>s are independently authored per market, not translations of the EN title.',
  'home::meta.title':
    'Localised SEO <title>s are independently authored per market, not translations of the EN title.',
};

// Brand names keep the English word and must be masked on both sides before matching.
// Without this, `Vaulto` and `Family Asset Vault` both read as the common noun.
const BRANDS = ['Family Asset Vault', 'Family asset vault', 'Vaulto'];
export const mask = (s) => BRANDS.reduce((acc, b) => acc.split(b).join('~'), s);

// ASCII \b would be fine here (the needle is ASCII), but the lookarounds say it.
export const EN_NOUN = /(?<![A-Za-z])[Vv]ault(?![A-Za-z])/;

export function flatten(node, path = '', out = {}) {
  if (typeof node === 'string') out[path] = node;
  else if (Array.isArray(node)) node.forEach((v, i) => flatten(v, `${path}[${i}]`, out));
  else if (node && typeof node === 'object')
    for (const [k, v] of Object.entries(node)) flatten(v, path ? `${path}.${k}` : k, out);
  return out;
}

/**
 * The pure core. `en` and `doc` are flat `{path: string}` maps.
 * Returns problem strings, each prefixed with a stable `[code]`.
 */
export function checkLocale(surface, loc, en, doc) {
  const problems = [];
  const entry = LEXICON[loc];
  if (!entry) {
    return [
      `[lexicon] ${surface}/${loc}.json ships but '${loc}' has no LEXICON entry — ` +
        `add it from the app's nav.vault before shipping this locale.`,
    ];
  }

  const clip = (v) => `${v.slice(0, 120)}${v.length > 120 ? '…' : ''}`;

  // 1. POSITIVE — English-anchored fields must name the vault in this locale.
  for (const [path, enValue] of Object.entries(en)) {
    if (!EN_NOUN.test(mask(enValue))) continue;
    if (ALLOW[`${surface}::${path}`]) continue;
    const value = doc[path];
    if (value === undefined) continue; // a missing key is check-i18n-coverage's job
    if (!mask(value).toLowerCase().includes(entry.stem)) {
      problems.push(
        `[missing-noun] ${surface}/${loc}.json :: ${path}\n` +
          `    EN names the vault here, so ${loc} must use "${entry.app}" (stem "${entry.stem}").\n` +
          `    got: ${clip(value)}`
      );
    }
  }

  // 2. DENYLIST — a retired noun anywhere in this locale is a failure.
  for (const retired of entry.retired) {
    for (const [path, value] of Object.entries(doc)) {
      if (mask(value).toLowerCase().includes(retired.toLowerCase())) {
        problems.push(
          `[retired-noun] ${surface}/${loc}.json :: ${path}\n` +
            `    "${retired}" is retired for ${loc}; the app says "${entry.app}".\n` +
            `    Mind agreement when you swap it — gender, case and particles move with the noun.\n` +
            `    got: ${clip(value)}`
        );
      }
    }
  }

  return problems;
}

/** Guards the lexicon itself: every app noun must satisfy its own stem. */
export function checkLexicon() {
  const problems = [];
  for (const [loc, { app, stem, retired }] of Object.entries(LEXICON)) {
    if (!mask(app).toLowerCase().includes(stem))
      problems.push(`[lexicon] ${loc}: stem "${stem}" does not occur in app noun "${app}"`);
    for (const r of retired)
      if (app.toLowerCase().includes(r.toLowerCase()))
        problems.push(`[lexicon] ${loc}: retired "${r}" is a substring of the app noun "${app}"`);
  }
  return problems;
}

function main() {
  const read = (f) => flatten(JSON.parse(readFileSync(f, 'utf8')));
  const surfaces = readdirSync(CONTENT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(CONTENT, d.name, 'en.json')))
    .map((d) => d.name)
    .sort();

  const failures = [...checkLexicon()];
  let pairs = 0;

  for (const surface of surfaces) {
    const en = read(join(CONTENT, surface, 'en.json'));
    const locales = readdirSync(join(CONTENT, surface))
      .filter((f) => f.endsWith('.json') && f !== 'en.json')
      .map((f) => basename(f, '.json'))
      .sort();
    for (const loc of locales) {
      pairs++;
      failures.push(...checkLocale(surface, loc, en, read(join(CONTENT, surface, `${loc}.json`))));
    }
  }

  if (failures.length) {
    console.error(
      `\n✗ vault-noun gate: ${failures.length} violation(s) of the ARY-1389 ruling.\n` +
        `  Non-English copy must use the app's own vault noun (nav.vault).\n`
    );
    for (const f of failures) console.error(`  ${f}`);
    console.error(
      `\n  Lexicon lives in scripts/check-vault-noun.mjs; the source of truth is\n` +
        `  Asset-Vault lib/i18n/src/translations.ts -> nav.vault.\n`
    );
    process.exit(1);
  }

  console.log(
    `✓ vault-noun gate: ${surfaces.length} surfaces, ${pairs} surface×locale pairs, ` +
      `${Object.keys(LEXICON).length} locales in lexicon, 0 violations.`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
