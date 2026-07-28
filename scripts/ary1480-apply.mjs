#!/usr/bin/env node
/**
 * ARY-1480 — apply the ARY-1389 brand-noun ruling to the localised blog corpus.
 *
 * Source of truth for each locale's noun is the app's `nav.vault`
 * (lib/i18n/src/translations.ts in Asset-Vault) — NOT a fresh translation and
 * NOT the security page's wording:
 *   de Tresor · es Bóveda · hi वॉल्ट · it Cassaforte · ja 保管庫
 *   ko 보관함 · nl Kluis · sv Valv · zh 保险库
 *
 * Every edit is an exact before→after pair with an expected occurrence count.
 * A miss, a double-apply, or a drifted source line aborts the whole run.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIR = join(ROOT, 'src/content/blog-i18n');

// ── de · Tresor (masc.) — der/ein privater Tresor; no agreement change ────────
const DE_ISO = [
  'und der Vault jeder Person ist von anderen Nutzern isoliert — ein privater Vault, den Sie kontrollieren.',
  'und der Tresor jeder Person ist von anderen Nutzern isoliert — ein privater Tresor, den Sie kontrollieren.',
];
const DE_CTA = ['[Starten Sie Ihren Vault — kostenlos]', '[Starten Sie Ihren Tresor — kostenlos]'];

// ── es · Bóveda (fem.) — el→la, aislado→aislada, un privado→una privada ──────
const ES_ISO = [
  'y el vault de cada persona está aislado de los demás usuarios: un vault privado que tú controlas.',
  'y la bóveda de cada persona está aislada de los demás usuarios: una bóveda privada que tú controlas.',
];
const ES_CTA = ['[Empieza tu vault — gratis]', '[Empieza tu bóveda — gratis]'];

// ── it · Cassaforte (fem.) — il→la, isolato→isolata, un privato→una privata ──
const IT_ISO_A = [
  'e il vault di ogni persona è isolato dagli altri utenti: un vault privato che controlli tu.',
  'e la cassaforte di ogni persona è isolata dagli altri utenti: una cassaforte privata che controlli tu.',
];
const IT_ISO_B = [
  'e il vault di ogni persona è isolato dagli altri utenti: un vault privato che controlli tu.',
  'e la cassaforte di ogni persona è isolata dagli altri utenti: una cassaforte privata che controlli tu.',
];
const IT_CTA = ['[Inizia il tuo vault — gratis]', '[Inizia la tua cassaforte — gratis]'];

// ── nl · Kluis (de-word) — `privévault` is a closed compound → `privékluis` ──
const NL_ISO = [
  'en is de vault van elke persoon geïsoleerd van andere gebruikers — een privévault die jij beheert.',
  'en is de kluis van elke persoon geïsoleerd van andere gebruikers — een privékluis die jij beheert.',
];

// ── sv · Valv (neuter ett-word) — `isolerat`/`privat`/`ditt` already agree ───
const SV_ISO = [
  'och varje persons vault är isolerat från andra användare — ett privat vault som du styr över.',
  'och varje persons valv är isolerat från andra användare — ett privat valv som du styr över.',
];
const SV_CTA = ['[Börja med ditt vault — gratis]', '[Börja med ditt valv — gratis]'];

// ── hi · वॉल्ट (masc.) — so `अपनी vault` also loses its wrong fem. agreement ──
const HI_ISO = [
  'और हर व्यक्ति का vault दूसरे उपयोगकर्ताओं से अलग रहता है — एक निजी vault जिसे आप नियंत्रित करते हैं।',
  'और हर व्यक्ति का वॉल्ट दूसरे उपयोगकर्ताओं से अलग रहता है — एक निजी वॉल्ट जिसे आप नियंत्रित करते हैं।',
];

// ── ja · 保管庫 — Latin-adjacency spaces go with the Latin token ─────────────
const JA_ISO = [
  '一人ひとりの vault は他のユーザーから分離されています。あなたが管理するプライベートな vault です。',
  '一人ひとりの保管庫は他のユーザーから分離されています。あなたが管理するプライベートな保管庫です。',
];

// ── ko · 보관함 — 보관함 is 받침-final, so the topic particle 는 must become 은 ──
const KO_ISO = [
  '각 사용자의 vault는 다른 사용자와 분리되어 있습니다',
  '각 사용자의 보관함은 다른 사용자와 분리되어 있습니다',
];

// ── zh · 保险库 — drop only the Latin-adjacency space, keep dash spacing ─────
const ZH_ISO = [
  '每个人的 vault 都与其他用户相互隔离——这是你自己掌控的私人 vault。',
  '每个人的保险库都与其他用户相互隔离——这是你自己掌控的私人保险库。',
];

/** file → [ [before, after, expectedCount], … ] */
const EDITS = {
  // de — 1 file
  'de/checkliste-digitaler-nachlass-familie.md': [
    [...DE_ISO, 1],
    [...DE_CTA, 1],
  ],

  // es — 2 files
  'es/calcular-patrimonio-neto-familiar.md': [[...ES_ISO, 1], [...ES_CTA, 1]],
  'es/inventario-activos-familiares-empezar.md': [[...ES_ISO, 1], [...ES_CTA, 1]],

  // it — 3 files
  'it/calcolare-patrimonio-netto-famiglia.md': [[...IT_ISO_A, 1], [...IT_CTA, 1]],
  'it/checklist-digitale-pianificazione-successoria.md': [[...IT_ISO_B, 1], [...IT_CTA, 1]],
  'it/inventario-patrimoniale-familiare-inizio.md': [[...IT_ISO_A, 1], [...IT_CTA, 1]],

  // nl — 3 files; two CTA verbs (Start je / Begin je), kept as written
  'nl/digitale-nalatenschapsplanning-checklist-familie.md': [
    [...NL_ISO, 1],
    ['[Start je vault — gratis]', '[Start je kluis — gratis]', 1],
  ],
  'nl/gezinsinventaris-bezittingen-starten.md': [
    [...NL_ISO, 1],
    ['[Start je vault — gratis]', '[Start je kluis — gratis]', 1],
  ],
  'nl/nettovermogen-gezin-berekenen-stappen.md': [
    [...NL_ISO, 1],
    ['[Begin je vault — gratis]', '[Begin je kluis — gratis]', 1],
  ],

  // sv — 1 file
  'sv/berakna-familjens-nettoformogenhet.md': [[...SV_ISO, 1], [...SV_CTA, 1]],

  // hi — 4 files. Two CTA spellings differ only by nukta (मुफ्त / मुफ़्त); the
  // third carries a wrong feminine possessive (अपनी) that वॉल्ट now corrects.
  'hi/digital-estate-planning-checklist.md': [
    [...HI_ISO, 1],
    ['[अपना vault शुरू करें — मुफ्त]', '[अपना वॉल्ट शुरू करें — मुफ्त]', 1],
  ],
  'hi/how-to-calculate-your-familys-net-worth.md': [
    [...HI_ISO, 1],
    ['[अपनी vault शुरू करें — मुफ़्त]', '[अपना वॉल्ट शुरू करें — मुफ़्त]', 1],
  ],
  'hi/what-is-a-family-asset-inventory.md': [
    [...HI_ISO, 1],
    ['[अपना vault शुरू करें — मुफ़्त]', '[अपना वॉल्ट शुरू करें — मुफ़्त]', 1],
  ],
  // The one file whose hit is not the isolation clause. `private` → `निजी` to
  // match the निजी वॉल्ट wording its three sibling hi posts already use.
  'hi/how-to-make-a-home-inventory.md': [
    [
      'आपकी सूची एक private vault में रहती है जिस पर आपका नियंत्रण होता है',
      'आपकी सूची एक निजी वॉल्ट में रहती है जिस पर आपका नियंत्रण होता है',
      1,
    ],
  ],

  // ja — 1 file
  'ja/digital-estate-planning-checklist.md': [
    [...JA_ISO, 1],
    ['[無料で vault を始める]', '[無料で保管庫を始める]', 1],
  ],

  // ko — 3 files; three different CTA phrasings, each kept in its own shape
  'ko/digital-estate-planning-checklist.md': [
    [...KO_ISO, 1],
    ['개인 vault입니다.', '개인 보관함입니다.', 1],
    ['[Vault 시작하기 — 무료]', '[보관함 시작하기 — 무료]', 1],
  ],
  'ko/how-to-calculate-your-familys-net-worth.md': [
    [...KO_ISO, 1],
    ['개인 vault입니다.', '개인 보관함입니다.', 1],
    ['[무료로 vault 시작하기]', '[무료로 보관함 시작하기]', 1],
  ],
  'ko/what-is-a-family-asset-inventory.md': [
    [...KO_ISO, 1],
    ['개인 vault입니다.', '개인 보관함입니다.', 1],
    ['[내 vault 시작하기 — 무료]', '[내 보관함 시작하기 — 무료]', 1],
  ],

  // zh — 3 files; one CTA has spaces around the 破折号, two do not. Only the
  // Latin-adjacency space is removed; existing dash spacing is left alone.
  'zh/digital-estate-planning-checklist.md': [
    [...ZH_ISO, 1],
    ['[开始创建你的 vault —— 免费]', '[开始创建你的保险库 —— 免费]', 1],
  ],
  'zh/how-to-calculate-your-familys-net-worth.md': [
    [...ZH_ISO, 1],
    ['[开始创建你的 vault——免费]', '[开始创建你的保险库——免费]', 1],
  ],
  'zh/what-is-a-family-asset-inventory.md': [
    [...ZH_ISO, 1],
    ['[开始创建你的 vault——免费]', '[开始创建你的保险库——免费]', 1],
  ],
};

let applied = 0;
const failures = [];

for (const [rel, edits] of Object.entries(EDITS)) {
  const path = join(DIR, rel);
  let text = readFileSync(path, 'utf8');
  for (const [before, after, expected] of edits) {
    const found = text.split(before).length - 1;
    if (found !== expected) {
      failures.push(`${rel}: expected ${expected}× "${before.slice(0, 48)}…", found ${found}`);
      continue;
    }
    text = text.split(before).join(after);
    applied += expected;
  }
  writeFileSync(path, text);
}

console.log(`applied ${applied} replacements across ${Object.keys(EDITS).length} files`);
if (failures.length) {
  console.error('\nFAILED:');
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
