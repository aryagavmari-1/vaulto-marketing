#!/usr/bin/env node
/**
 * $0 marketing-site translator (ARY-427, board directive ARY-425).
 *
 * Machine-translates every English content catalog under
 * `src/i18n/content/<group>/en.json` into the FULL set of app-supported locales
 * (enumerated from `src/config/i18n.ts` — single source of truth, no hand-guessing)
 * using the company OpenAI connection (funded under ARY-132, well within the
 * $5/mo cap for a one-time bulk run). English stays canonical + per-string
 * fallback; re-running is idempotent and cheap.
 *
 * Usage:
 *   node scripts/translate.mjs                 # translate only missing <locale>.json
 *   node scripts/translate.mjs --force         # re-translate everything
 *   node scripts/translate.mjs --group=security  # restrict to one group
 *   node scripts/translate.mjs --locale=fr,de    # restrict to some locales
 *
 * Env (never committed — pull from the Render API service at run time):
 *   OPENAI_API_KEY   (required)
 *   OPENAI_BASE_URL  (optional, defaults to https://api.openai.com/v1)
 *   OPENAI_MODEL     (optional, defaults to gpt-5.4)
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CONTENT_DIR = join(ROOT, 'src', 'i18n', 'content');

const API_KEY = process.env.OPENAI_API_KEY;
const BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.4';
if (!API_KEY) {
  console.error('ERROR: OPENAI_API_KEY is not set. Source the run-time env first.');
  process.exit(1);
}

// ---- CLI flags -------------------------------------------------------------
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const onlyGroup = (args.find((a) => a.startsWith('--group=')) || '').split('=')[1];
const onlyLocales = (args.find((a) => a.startsWith('--locale=')) || '').split('=')[1];

// ---- Locale set: parsed from config/i18n.ts (the single source of truth) ---
function parseLocales() {
  const src = readFileSync(join(ROOT, 'src', 'config', 'i18n.ts'), 'utf8');
  const m = src.match(/export const LOCALES = \[([\s\S]*?)\] as const;/);
  if (!m) throw new Error('Could not parse LOCALES from config/i18n.ts');
  const codes = [...m[1].matchAll(/'([a-z]{2}(?:-[A-Z]{2})?)'/g)].map((x) => x[1]);
  const namesMatch = src.match(/LOCALE_NAMES[^=]*=\s*\{([\s\S]*?)\};/);
  const names = {};
  if (namesMatch) {
    for (const x of namesMatch[1].matchAll(/(\w[\w-]*):\s*'([^']+)'/g)) names[x[1]] = x[2];
  }
  return { codes, names };
}
const { codes: LOCALES, names: LOCALE_NAMES } = parseLocales();
const DEFAULT_LOCALE = 'en';
let targets = LOCALES.filter((l) => l !== DEFAULT_LOCALE);
if (onlyLocales) targets = targets.filter((l) => onlyLocales.split(',').includes(l));

// Full language names for the prompt (clearer than ISO codes for the model).
const LANG_FULL = {
  es: 'Spanish', fr: 'French', pt: 'Portuguese', de: 'German', it: 'Italian',
  nl: 'Dutch', zh: 'Simplified Chinese', ja: 'Japanese', ar: 'Arabic',
  hi: 'Hindi', ru: 'Russian', pl: 'Polish', tr: 'Turkish', ko: 'Korean', sv: 'Swedish',
};

// ---- Glossary + guardrails (CEO quality bar, ARY-427) ----------------------
const SYSTEM = `You are a professional localizer for Vaulto, a calm, trustworthy consumer app that helps families inventory their assets and keep important documents safe. You translate marketing-website copy from English into the target language.

Return ONLY a JSON object with EXACTLY the same shape and keys as the input. Translate string VALUES only; never translate, add, or remove keys.

HARD RULES — follow every one:
1. Brand name "Vaulto" is NEVER translated or transliterated — keep it verbatim in every language (including non-Latin scripts).
2. Preserve EXACTLY, unchanged: all emoji, all HTML tags and attributes (e.g. <b>, </b>, <a ...>), HTML entities (e.g. &nbsp;), arrows/symbols (→ · —), {curly_placeholders}, file extensions (.zip), and technical/standard terms: TLS, HTTPS, scrypt, AES-256, GDPR, and article references like "Article 20" / "Article 17".
3. Keep the product's "vault" metaphor: translate the common noun "vault" to the natural local word for a secure strongbox/safe (e.g. ES "bóveda"), used consistently throughout; but the BRAND "Vaulto" stays "Vaulto".
4. SECURITY/LEGAL ACCURACY IS CRITICAL. The English deliberately claims only: encryption in transit (TLS) and encryption at rest on managed infrastructure, hashed passwords, strict access control. NEVER strengthen, weaken, or change these claims. Do NOT introduce "zero-knowledge", "end-to-end encrypted", "bank-level", "military-grade", or any certification — if the English explicitly disclaims a term, keep that disclaimer's meaning intact in translation.
5. Tone: warm, plain-language, reassuring — never hype. Match the calm, respectful register of the source. Use the friendly/informal "you" register where the language distinguishes (e.g. ES "tú", FR "vous" for respect is acceptable, DE "du").
6. Keep translations concise — similar length to the source so layout/CTA buttons don't overflow.`;

async function translateGroupToLocale(group, enObj, locale) {
  const langName = LANG_FULL[locale] || locale;
  const user = `Target language: ${langName} (locale code "${locale}", native name "${LOCALE_NAMES[locale] || langName}").

Translate the string values of this JSON into ${langName}, obeying every hard rule. Return the JSON object only:

${JSON.stringify(enObj, null, 2)}`;

  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_object' },
  };
  // gpt-5.x: keep reasoning light for a translation task (cost/latency).
  if (/^gpt-5/.test(MODEL)) body.reasoning_effort = 'low';

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenAI ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty completion');
  return JSON.parse(content);
}

/** Verify translated object has the same key shape as English (structural QA). */
function sameShape(a, b, path = '') {
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return [`${path}: expected array`];
    const errs = [];
    a.forEach((el, i) => errs.push(...sameShape(el, b[i], `${path}[${i}]`)));
    return errs;
  }
  if (a && typeof a === 'object') {
    if (!b || typeof b !== 'object' || Array.isArray(b)) return [`${path}: expected object`];
    const errs = [];
    for (const k of Object.keys(a)) errs.push(...sameShape(a[k], b[k], path ? `${path}.${k}` : k));
    return errs;
  }
  return []; // primitive — value differs, that's the point
}

async function main() {
  const groups = readdirSync(CONTENT_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((g) => !onlyGroup || g === onlyGroup);

  let translated = 0;
  let skipped = 0;
  const issues = [];

  for (const group of groups) {
    const enPath = join(CONTENT_DIR, group, 'en.json');
    if (!existsSync(enPath)) { console.warn(`! ${group}: no en.json, skipping`); continue; }
    const enObj = JSON.parse(readFileSync(enPath, 'utf8'));

    for (const locale of targets) {
      const outPath = join(CONTENT_DIR, group, `${locale}.json`);
      if (!FORCE && existsSync(outPath)) { skipped++; continue; }
      process.stdout.write(`→ ${group}/${locale} … `);
      try {
        const out = await translateGroupToLocale(group, enObj, locale);
        const shapeErrs = sameShape(enObj, out);
        if (shapeErrs.length) {
          issues.push(`${group}/${locale}: shape drift — ${shapeErrs.slice(0, 3).join('; ')}`);
          console.log('SHAPE-MISMATCH (skipped write)');
          continue;
        }
        writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
        translated++;
        console.log('ok');
      } catch (e) {
        issues.push(`${group}/${locale}: ${e.message}`);
        console.log('FAILED');
      }
    }
  }

  console.log(`\nDone. translated=${translated} skipped(existing)=${skipped} groups=${groups.length} locales=${targets.length}`);
  if (issues.length) {
    console.log('\nISSUES:');
    issues.forEach((i) => console.log('  - ' + i));
    process.exitCode = 1;
  }
}

main();
