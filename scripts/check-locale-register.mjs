#!/usr/bin/env node
/**
 * Locale register & variant guard (ARY-1433, inverted for Brazil by ARY-4507).
 *
 * The `pt` locale is ONE locale with ONE variant. Before this guard existed,
 * every re-run of `scripts/translate.mjs` re-rolled the variant per group, so
 * /privacy shipped European Portuguese while /security shipped Brazilian — on
 * the two pages whose whole job is to look trustworthy. That failure mode is
 * what this file exists to prevent, and it is unchanged.
 *
 * What changed is WHICH variant is correct.
 *
 * ARY-1433 ruled pt-PT on three premises. ARY-4507 re-measured them:
 *   1. "It agrees with the app's own `pt` catalog" — STILL TRUE. `lib/i18n`'s pt
 *      block is predominantly pt-PT (67 pt-PT lexicon markers vs 14 pt-BR). The
 *      app is therefore now the side that is wrong; that is tracked separately,
 *      and marketing must not wait for it.
 *   2. "It agrees with most of the site already" — a statement about the cost of
 *      the change, not about which variant is right.
 *   3. "It matches who we sell to … Portugal and Portuguese speakers in the
 *      UK/EU are the realistic `pt` audience today" — FALSIFIED. Board directive
 *      ARY-4458 (2026-11-09) narrows v1 to **Brazil and the United Kingdom**
 *      with **pt-BR and en-GB** as the shipped languages.
 *
 * Premise 3 was the only one that spoke to the audience, and it is now false, so
 * the ruling flips:
 *
 *   **Ruling (ARY-4507) — `pt` is Brazilian Portuguese (pt-BR).** `/pt/` declares
 *   `lang="pt-BR"` / `hreflang="pt-BR"` via HREFLANG in src/config/i18n.ts. The
 *   route stays `/pt/`; there is no `pt-PT`. Serving Portugal would need its own
 *   currency, legal and estate-planning framing, so it must be a deliberate new
 *   locale, never per-file drift.
 *
 * This sweeps every pt surface (page JSON + translated blog Markdown) and fails
 * on European-Portuguese lexicon and on `tu`-form address.
 *
 * Deny by default: a term is a failure unless the exact surrounding phrase is in
 * ALLOW below. That way a NEW use has to be looked at by a human rather than
 * silently inheriting an old exception.
 *
 * Usage:  node scripts/check-locale-register.mjs
 * Also runs in `prebuild`, so a drifting translation can't reach a build.
 *
 * Exit codes (deliberate, per the house convention):
 *   0 — swept clean.
 *   1 — it ran and FOUND European-register copy.
 *   2 — it COULD NOT RUN: a rule failed its own positive control, or there were
 *       no surfaces to sweep. Never conflate this with 0.
 *
 * Contract + lexicon: I18N.md → "Locale register & variant (pt)".
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const CONTENT_DIR = join(ROOT, 'src/i18n/content');
const BLOG_DIR = join(ROOT, 'src/content/blog-i18n');

/**
 * Unicode-safe word boundary. JS `\b` is ASCII-only, so `/\bvocê\b/u` silently
 * fails to match (the boundary after "ê" never fires) — which is exactly how a
 * naive sweep reports a clean file that is not clean. Use letter lookarounds.
 */
const word = (body) =>
  body instanceof RegExp ? body : new RegExp(`(?<!\\p{L})(?:${body})(?!\\p{L})`, 'giu');

/**
 * pt-PT term → the pt-BR term we require instead.
 *
 * `probe` is a positive control: a phrase this rule MUST match. It is asserted
 * on every run, so a rule that has been broken by an edit (a bad escape, a
 * lookaround that never fires) is reported as a dead rule instead of quietly
 * passing everything. A sweep whose rules cannot match anything returns 0
 * findings, which reads identically to clean — this is the check that tells
 * those two apart.
 */
const PT_PT_LEXICON = [
  ['ficheiros?', 'arquivo', 'os seus ficheiros'],
  ['palavras?-passe', 'senha', 'a sua palavra-passe'],
  ['utilizador(es)?', 'usuário', 'o utilizador'],
  ['ecr[ãa]s?', 'tela', 'no ecrã'],
  ['registos?', 'registro', 'um registo'],
  ['encripta(ção|do|da|dos|das|r)|encriptamos', 'criptografia / criptografado', 'encriptação de ponta a ponta'],
  ['desencriptar|desencripta', 'descriptografar', 'desencriptar os dados'],
  ['aplicativos? m[óo]vel', 'aplicativo', 'aplicativo móvel'],
  ['folhas? de c[áa]lculo', 'planilha', 'uma folha de cálculo'],
  ['planeamento', 'planejamento', 'planeamento sucessório'],
  ['contactos?', 'contato', 'os seus contactos'],
  ['telem[óo]ve(l|is)', 'celular', 'no telemóvel'],
  ['factos?', 'fato', 'um facto'],
  ['registar|registamos|registe', 'cadastrar / registrar', 'registar uma conta'],
  ['partilhar|partilhad[oa]s?|partilhamos|partilha', 'compartilhar', 'partilhar o cofre'],
  ['vinculativ[oa]s?', 'vinculante', 'é vinculativo'],
  ['intentar', 'propor / ajuizar', 'intentar uma ação'],
  ['comprovativos?', 'comprovante', 'os comprovativos'],
  ['moradas?', 'endereço', 'a sua morada'],
  // Brazil keeps the circumflex where Portugal writes an acute on these -ónimo
  // /-ómico stems. This is the most common give-away in finance copy, and the
  // lexicon rules above would never catch it.
  ['patrim[ó]nios?', 'patrimônio (BR takes the circumflex)', 'o património líquido'],
  ['econ[ó]mic[oa]s?', 'econômico (BR takes the circumflex)', 'o cenário económico'],
  ['telef[ó]nic[oa]s?', 'telefônico (BR takes the circumflex)', 'o contacto telefónico'],
  // pt-PT contracts `em` + determiner into `noutro/nalgum/nisto`; pt-BR writes
  // the two words out ("em outro país").
  ['noutr[oa]s?|nalgum[ao]?s?|noutrem', 'em outro / em algum', 'noutro país'],
  // Noun position only: pt-PT says "o controlo", but a bare "controlo" is also
  // the 1st-person verb ("eu controlo"), so match only with a determiner.
  [
    /(?<!\p{L})(?:o|do|no|ao|seu|meu|todo|esse|este|algum|qualquer)\s+controlo(?!\p{L})/giu,
    'controle',
    'o controlo',
  ],
  // pt-PT marks the progressive with `estar a` + infinitive; pt-BR uses the
  // gerund ("está fazendo", not "está a fazer").
  [
    /(?<!\p{L})(?:est(?:ou|á|ão|amos|ava|avam)|fic(?:o|a|am|amos))\s+a\s+\p{L}+(?:ar|er|ir)(?!\p{L})/giu,
    'the gerund ("está fazendo", not "está a fazer")',
    'está a guardar',
  ],
];

/**
 * `tu`-form address. The house register is formal-polite `você` + third-person
 * singular verbs, which is the standard Brazilian business register. `tu` is
 * still wrong — note that pt-BR's correct subject pronoun IS `você`, so the
 * ARY-1433 rule banning `você` as a subject is deliberately NOT carried over.
 *
 * These patterns are deliberately ACCENT-EXACT. Widening `estás` to `est[áa]s`
 * (as a first pass here did) makes it match the ordinary demonstrative "estas"
 * — "estas coisas" is perfectly good Portuguese and is not tu-form address, so
 * the widened rule reported a false positive on correct copy. A register guard
 * that cries wolf gets weakened by the next person in a hurry; keep it exact.
 */
const TU_FORMS = [
  ['teu|tua|teus|tuas|contigo', 'tua'],
  ['tens|podes|vês|estás|manténs|escolhes|forneces|capturas', 'podes'],
  ['estiveres|quiseres|verás|poderes', 'se quiseres'],
];

/**
 * Reviewed exceptions. An occurrence is excused only if it falls inside one of
 * these exact phrases. Add a line here (with a reason) rather than weakening a
 * rule above.
 */
const ALLOW = [
  // Blog article slugs are live URLs. `planeamento` survives inside this one
  // slug because renaming it would break an indexed URL and needs a redirect;
  // tracked as the ARY-4507 follow-up. Prose must still say "planejamento".
  'checklist-digital-planeamento-sucessorio',
];

const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};

/** Flatten every translatable string out of a content JSON blob. */
const strings = (node, out = []) => {
  if (typeof node === 'string') out.push(node);
  else if (Array.isArray(node)) node.forEach((v) => strings(v, out));
  else if (node && typeof node === 'object') Object.values(node).forEach((v) => strings(v, out));
  return out;
};

/**
 * Collect the pt surfaces: one text blob per file, tagged with the bucket it
 * came from.
 *
 * The bucket tag is load-bearing. There are TWO independent corpora here (page
 * JSON and translated blog Markdown) and they are discovered by walking
 * directories, so if one of them moves or is renamed, that half of the sweep
 * silently contributes zero surfaces — and zero findings reads exactly like
 * clean. A bare "did we scan anything at all?" check does not catch it: losing
 * only the blog half still leaves 10 page surfaces and reports a pass. Each
 * bucket is asserted non-empty separately below.
 */
function surfaces(locale) {
  const files = [];
  for (const f of walk(CONTENT_DIR)) {
    if (f.endsWith(`/${locale}.json`)) {
      files.push({ file: f, bucket: 'content', text: strings(JSON.parse(readFileSync(f, 'utf8'))).join('\n') });
    }
  }
  for (const f of walk(join(BLOG_DIR, locale))) {
    if (f.endsWith('.md')) files.push({ file: f, bucket: 'blog', text: readFileSync(f, 'utf8') });
  }
  return files;
}

/** Buckets that must contribute at least one surface, and where they live. */
const REQUIRED_BUCKETS = [
  ['content', () => relative(ROOT, CONTENT_DIR) + '/<group>/pt.json'],
  ['blog', () => relative(ROOT, join(BLOG_DIR, 'pt')) + '/*.md'],
];

/** True if the match at [start,end) sits inside a reviewed exception. */
const excused = (text, start, end) =>
  ALLOW.some((phrase) => {
    let i = -1;
    while ((i = text.indexOf(phrase, i + 1)) !== -1) {
      if (start >= i && end <= i + phrase.length) return true;
    }
    return false;
  });

function scan(text, rules) {
  const found = [];
  for (const [pattern, fix] of rules) {
    for (const m of text.matchAll(word(pattern))) {
      if (excused(text, m.index, m.index + m[0].length)) continue;
      const line = text.slice(0, m.index).split('\n').length;
      const ctx = text.slice(Math.max(0, m.index - 45), m.index + m[0].length + 45).replace(/\s+/g, ' ');
      found.push({ term: m[0], fix, line, ctx });
    }
  }
  return found;
}

const RULES = [
  ...PT_PT_LEXICON,
  ...TU_FORMS.map(([t, probe]) => [t, 'formal third person with "você" / "o seu"', probe]),
];

// ---------------------------------------------------------------------------
// Positive control, inside the sweep. A rule that matches nothing at all makes
// this guard report "clean" over copy it is no longer reading.
// ---------------------------------------------------------------------------
const dead = RULES.filter(([pattern, , probe]) => !probe || !word(pattern).test(probe));
if (dead.length) {
  console.error('pt locale register check COULD NOT RUN — rule(s) failed their own positive control:');
  for (const [pattern, , probe] of dead) {
    console.error(`   ${pattern} did not match its probe ${JSON.stringify(probe ?? null)}`);
  }
  console.error('\nFix the pattern (or its probe) — a rule that cannot match is not enforcing anything.');
  process.exit(2);
}

const SURFACES = surfaces('pt');

// Every required corpus must contribute at least one surface. Checked BEFORE
// the sweep so "the blog corpus moved" can never be reported as a clean pass.
const missing = REQUIRED_BUCKETS.filter(([b]) => !SURFACES.some((s) => s.bucket === b));
if (missing.length) {
  console.error('pt locale register check COULD NOT RUN — a required corpus contributed 0 surfaces:');
  for (const [bucket, where] of missing) console.error(`   bucket "${bucket}" is empty — expected ${where()}`);
  console.error('\nThis is not a clean sweep; it is an unread one. Restore the path or update this guard.');
  process.exit(2);
}

let failures = 0;
let scanned = 0;
for (const { file, text } of SURFACES) {
  scanned++;
  const hits = scan(text, RULES);
  if (!hits.length) continue;
  failures += hits.length;
  console.error(`\n✖ ${relative(ROOT, file)}`);
  for (const h of hits) {
    console.error(`   line ${h.line}: "${h.term}" → use ${h.fix}`);
    console.error(`     …${h.ctx}…`);
  }
}

if (failures) {
  console.error(
    `\npt locale register check FAILED — ${failures} issue(s) across ${scanned} surface(s).\n` +
      'The pt locale is Brazilian Portuguese (pt-BR), formal "você" + third person.\n' +
      'See I18N.md → "Locale register & variant (pt)". If an occurrence is genuinely\n' +
      'correct pt-BR, add the exact phrase to ALLOW in scripts/check-locale-register.mjs.\n',
  );
  process.exit(1);
}
console.log(
  `pt locale register check passed — ${scanned} surfaces, ${RULES.length} rules (all controls fired), pt-BR + formal "você".`,
);
