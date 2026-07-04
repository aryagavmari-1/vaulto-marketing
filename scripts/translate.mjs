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
4. SECURITY/LEGAL ACCURACY IS CRITICAL. The English deliberately claims only: encryption in transit (TLS); a managed database that is encrypted at rest; uploaded files kept in private storage reachable only through short-lived, signed links; hashed passwords; and strict access control. NEVER strengthen, weaken, or change these claims. In particular, do NOT claim that uploaded files or photos are encrypted at rest, and do NOT introduce "zero-knowledge", "end-to-end encrypted", "bank-level", "military-grade", or any certification — if the English explicitly disclaims a term, keep that disclaimer's meaning intact in translation.
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

// ===========================================================================
//  BLOG MODE (ARY-523)
// ===========================================================================
// The cornerstone blog articles live as Markdown in `src/content/blog/*.md`
// (English source-of-truth, un-prefixed URLs that must never change). This mode
// machine-translates each into the 15 non-English locales and writes per-locale
// Markdown overlays under `src/content/blog-i18n/<locale>/<translated-slug>.md`,
// then regenerates `src/i18n/blog-slugs.json` (the canonical-id → per-locale-slug
// manifest the routing/hreflang/switcher derive from). English `blog/` files are
// never touched. Re-runnable: `node scripts/translate.mjs --group=blog [--force]`.
const BLOG_SRC_DIR = join(ROOT, 'src', 'content', 'blog');
const BLOG_I18N_DIR = join(ROOT, 'src', 'content', 'blog-i18n');
const BLOG_MANIFEST = join(ROOT, 'src', 'i18n', 'blog-slugs.json');

// Locales whose script is Latin: in-language translated slugs are clean ASCII.
// Non-Latin scripts (zh/ja/ar/hi/ru/ko) would yield percent-encoded, fragile
// slugs with little local-SEO value, so they keep the English slug under their
// locale prefix (documented tradeoff per ARY-523's stated fallback latitude).
const LATIN_SLUG_LOCALES = new Set(['es', 'fr', 'pt', 'de', 'it', 'nl', 'pl', 'tr', 'sv']);

const SLUG_PREMAP = { 'ı': 'i', 'ł': 'l', 'ø': 'o', 'đ': 'd', 'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'þ': 'th', 'ð': 'd', 'ñ': 'n' };
function slugify(s) {
  const pre = [...String(s)].map((c) => SLUG_PREMAP[c] ?? c).join('');
  return pre
    .normalize('NFKD').replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

// Marketing internal paths we localize inside translated bodies so a reader in
// (say) Portuguese stays in Portuguese when they click an in-article link. The
// app CTA (https://app.myvaulto.com) and external URLs are left untouched.
const LOCALIZABLE_PATHS = ['security', 'privacy', 'features', 'planning', 'how-it-works', 'faq', 'blog'];
function localizeInternalLinks(markdown, locale) {
  if (locale === DEFAULT_LOCALE) return markdown;
  // Rewrite `](/security/)` → `](/<locale>/security/)` and bare `](/ )` → `](/<locale>/)`.
  let out = markdown.replace(/\]\(\/([a-z-]+)\/\)/g, (m, seg) =>
    LOCALIZABLE_PATHS.includes(seg) ? `](/${locale}/${seg}/)` : m);
  out = out.replace(/\]\(\/\)/g, `](/${locale}/)`);
  return out;
}

/** Minimal frontmatter splitter — returns {fm: rawYamlString, body}. */
function splitFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error('no frontmatter');
  return { fm: m[1], body: m[2].replace(/^\n+/, '') };
}

/** Parse the subset of frontmatter fields we need from an English source post. */
function parseEnFrontmatter(fm) {
  const get = (key) => {
    const m = fm.match(new RegExp(`^${key}:\\s*(?:"([^"]*)"|'([^']*)'|(.+))$`, 'm'));
    return m ? (m[1] ?? m[2] ?? m[3]).trim() : undefined;
  };
  const title = get('title');
  const description = get('description');
  const pubDate = get('pubDate');
  // faqs: parse the indented YAML list of {question, answer} pairs, if present.
  const faqs = [];
  // faqs is conventionally the last frontmatter key; capture to end (the inner
  // pair-regex below only extracts well-formed question/answer pairs anyway).
  const faqBlock = fm.match(/faqs:\n([\s\S]*)$/);
  if (faqBlock) {
    const re = /-\s*question:\s*"([^"]*)"\s*\n\s*answer:\s*"([^"]*)"/g;
    let mm;
    while ((mm = re.exec(faqBlock[1])) !== null) faqs.push({ question: mm[1], answer: mm[2] });
  }
  return { title, description, pubDate, faqs };
}

/** Serialize a localized post back to Markdown with frontmatter. */
function serializePost({ title, description, pubDate, ref, locale, slug, faqs }, body) {
  const lines = ['---'];
  lines.push(`title: ${JSON.stringify(title)}`);
  lines.push(`description: ${JSON.stringify(description)}`);
  lines.push(`pubDate: ${pubDate}`);
  lines.push(`ref: ${JSON.stringify(ref)}`);
  lines.push(`locale: ${JSON.stringify(locale)}`);
  lines.push(`slug: ${JSON.stringify(slug)}`);
  if (faqs && faqs.length) {
    lines.push('faqs:');
    for (const f of faqs) {
      lines.push(`  - question: ${JSON.stringify(f.question)}`);
      lines.push(`    answer: ${JSON.stringify(f.answer)}`);
    }
  }
  lines.push('---', '');
  return lines.join('\n') + body.replace(/\s*$/, '') + '\n';
}

const BLOG_SYSTEM = `You are a professional localizer for Vaulto, a calm, trustworthy consumer app that helps families inventory their assets and keep important documents safe. You translate a Markdown blog article from English into the target language.

Return ONLY a JSON object with EXACTLY these keys: "title", "description", "body", "slug", and (only if the input has them) "faqs". No other keys, no commentary.

HARD RULES — follow every one:
1. Brand name "Vaulto" is NEVER translated or transliterated — keep it verbatim everywhere (including non-Latin scripts), and keep its Markdown emphasis (e.g. **Vaulto**) intact.
2. "body" is Markdown. Preserve EXACTLY the Markdown structure: heading levels (#, ##, >), bullet/numbered lists, bold/italic, blockquotes, and line breaks. Translate the prose only.
3. Do NOT change, translate, or localize any URL inside a link — keep the exact target in parentheses, e.g. [security page](/security/) and (https://app.myvaulto.com) stay byte-for-byte. Translate only the visible link text in the square brackets.
4. Preserve unchanged: emoji, arrows/symbols (→ · —), HTML if any, {curly_placeholders}, file extensions, and technical/standard terms: TLS, HTTPS, AES-256, GDPR, "Article 20"/"Article 17".
5. SECURITY/LEGAL ACCURACY IS CRITICAL. The English deliberately claims only: encryption in transit (TLS/HTTPS); a managed database encrypted at rest; uploaded files in private storage reachable only via short-lived signed links; hashed passwords; strict access control. NEVER strengthen, weaken, add, or remove these claims. Do NOT introduce "zero-knowledge", "end-to-end encrypted", "bank-level", "military-grade", or any certification, and do NOT claim uploaded files/photos are encrypted at rest. Keep every disclaimer's meaning intact (e.g. "not financial advice").
6. Tone: warm, plain-language, reassuring — never hype. Match the calm register of the source and use the natural polite/informal "you" for the language.
7. Keep length close to the source.
8. "slug": a short, URL-safe slug for this article IN THE TARGET LANGUAGE — lowercase words separated by single hyphens, 3–7 meaningful words, no stop-word padding, no leading/trailing hyphen. For languages NOT written in the Latin alphabet, transliterate to Latin letters (romaji/pinyin/romanization) so the slug stays ASCII.`;

async function translateArticle(en, locale) {
  const langName = LANG_FULL[locale] || locale;
  const payload = { title: en.title, description: en.description, body: en.body };
  if (en.faqs.length) payload.faqs = en.faqs;
  const user = `Target language: ${langName} (locale "${locale}", native name "${LOCALE_NAMES[locale] || langName}").

Translate this article into ${langName}, obeying every hard rule. Return the JSON object only:

${JSON.stringify(payload, null, 2)}`;

  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: BLOG_SYSTEM },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_object' },
  };
  if (/^gpt-5/.test(MODEL)) body.reasoning_effort = 'low';

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty completion');
  return JSON.parse(content);
}

function rebuildManifest() {
  const manifest = {};
  for (const f of readdirSync(BLOG_SRC_DIR).filter((x) => x.endsWith('.md'))) {
    const id = f.replace(/\.md$/, '');
    manifest[id] = { en: id };
  }
  if (existsSync(BLOG_I18N_DIR)) {
    for (const loc of readdirSync(BLOG_I18N_DIR, { withFileTypes: true }).filter((d) => d.isDirectory())) {
      for (const f of readdirSync(join(BLOG_I18N_DIR, loc.name)).filter((x) => x.endsWith('.md'))) {
        const raw = readFileSync(join(BLOG_I18N_DIR, loc.name, f), 'utf8');
        const { fm } = splitFrontmatter(raw);
        const ref = (fm.match(/^ref:\s*"?([^"\n]+)"?/m) || [])[1];
        const slug = f.replace(/\.md$/, '');
        if (ref && manifest[ref]) manifest[ref][loc.name] = slug;
      }
    }
  }
  // Deterministic key order for clean diffs.
  const ordered = {};
  for (const k of Object.keys(manifest).sort()) {
    const v = manifest[k];
    ordered[k] = {};
    for (const l of ['en', ...targets].filter((l) => v[l])) ordered[k][l] = v[l];
  }
  writeFileSync(BLOG_MANIFEST, JSON.stringify(ordered, null, 2) + '\n');
  return ordered;
}

async function runBlog() {
  const { mkdirSync } = await import('node:fs');
  const sources = readdirSync(BLOG_SRC_DIR).filter((f) => f.endsWith('.md'));
  let translated = 0, skipped = 0;
  const issues = [];

  for (const file of sources) {
    const id = file.replace(/\.md$/, '');
    const raw = readFileSync(join(BLOG_SRC_DIR, file), 'utf8');
    const { fm, body } = splitFrontmatter(raw);
    const en = { ...parseEnFrontmatter(fm), body };

    for (const locale of targets) {
      const dir = join(BLOG_I18N_DIR, locale);
      // Skip if a translation for this article+locale already exists (unless --force).
      const existing = existsSync(dir)
        ? readdirSync(dir).find((f) => {
            const r = readFileSync(join(dir, f), 'utf8');
            return new RegExp(`^ref:\\s*"?${id}"?`, 'm').test(r);
          })
        : undefined;
      if (!FORCE && existing) { skipped++; continue; }

      process.stdout.write(`→ blog/${id} → ${locale} … `);
      try {
        const out = await translateArticle(en, locale);
        if (!out.title || !out.body) throw new Error('missing title/body');
        if (en.faqs.length && (!Array.isArray(out.faqs) || out.faqs.length !== en.faqs.length))
          throw new Error('faqs shape drift');
        const slug = LATIN_SLUG_LOCALES.has(locale) ? (slugify(out.slug) || id) : id;
        const localizedBody = localizeInternalLinks(out.body, locale);
        const post = serializePost(
          { title: out.title, description: out.description || en.description, pubDate: en.pubDate, ref: id, locale, slug, faqs: out.faqs },
          localizedBody,
        );
        mkdirSync(dir, { recursive: true });
        // If --force changed the slug, drop the stale file for this ref first.
        if (existing && existing !== `${slug}.md`) {
          const { unlinkSync } = await import('node:fs');
          unlinkSync(join(dir, existing));
        }
        writeFileSync(join(dir, `${slug}.md`), post);
        translated++;
        console.log(`ok (${slug})`);
      } catch (e) {
        issues.push(`blog/${id}/${locale}: ${e.message}`);
        console.log('FAILED');
      }
    }
  }

  const manifest = rebuildManifest();
  console.log(`\nBlog done. translated=${translated} skipped(existing)=${skipped} articles=${sources.length} locales=${targets.length}`);
  console.log(`Manifest: ${Object.keys(manifest).length} articles → src/i18n/blog-slugs.json`);
  if (issues.length) {
    console.log('\nISSUES:');
    issues.forEach((i) => console.log('  - ' + i));
    process.exitCode = 1;
  }
}

// ---- Dispatch --------------------------------------------------------------
if (onlyGroup === 'blog') {
  await runBlog();
} else if (onlyGroup) {
  await main();
} else {
  await main();
  await runBlog();
}
