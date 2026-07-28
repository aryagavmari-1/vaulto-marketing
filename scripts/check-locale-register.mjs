#!/usr/bin/env node
/**
 * Locale register & variant guard (ARY-1433).
 *
 * The `pt` locale is ONE locale with ONE variant: European Portuguese (pt-PT),
 * formal third-person address. Before this guard existed, every re-run of
 * `scripts/translate.mjs` re-rolled the variant per group, so /privacy shipped
 * European Portuguese while /security shipped Brazilian Portuguese — on the two
 * pages whose whole job is to look trustworthy.
 *
 * This sweeps every pt surface (page JSON + translated blog Markdown) and fails
 * on Brazilian-Portuguese lexicon and on `tu`-form address.
 *
 * Deny by default: a term is a failure unless the exact surrounding phrase is in
 * ALLOW below. That way a NEW use has to be looked at by a human rather than
 * silently inheriting an old exception.
 *
 * Usage:  node scripts/check-locale-register.mjs
 * Also runs in `prebuild`, so a drifting translation can't reach a build.
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

/** pt-BR term → the pt-PT term we require instead. */
const PT_BR_LEXICON = [
  ['arquivos?', 'ficheiro (computer file)'],
  ['senhas?', 'palavra-passe'],
  ['usu[áa]rios?', 'utilizador'],
  ['telas?', 'ecrã'],
  ['gerenciar|gerenciamento|gerenciad[oa]s?', 'gerir'],
  ['registros?', 'registo'],
  ['criptografia|criptografad[oa]s?|criptografar', 'encriptação / encriptado'],
  ['descriptografar', 'desencriptar'],
  ['banco de dados', 'base de dados'],
  ['aplicativos?', 'aplicação'],
  ['planilhas?', 'folha de cálculo'],
  ['configuraç(ão|ões)', 'Definições'],
  ['planejamento', 'planeamento'],
  ['contatos?', 'contacto'],
  // Noun position only: pt-PT says "o controlo", but "controle" is also the
  // legitimate formal imperative of "controlar" ("Controle quem pode abrir…"),
  // so match only when a determiner marks it as the noun.
  [/(?<!\p{L})(?:o|do|no|ao|seu|meu|todo|esse|este|algum|qualquer)\s+controle(?!\p{L})/giu, 'controlo'],
  ['compartilhar|compartilhad[oa]s?|compartilhamento', 'partilhar'],
  ['conex(ão|ões)', 'ligação'],
  ['celulares?', 'telemóvel'],
  ['fatos?', 'facto'],
  ['embaralhad[oa]s?|embaralhar', 'cifrado / cifrar'],
  ['cadastrar|cadastro', 'registar / registo'],
];

/**
 * Brand agreement (ARY-1432). "Vaulto" is masculine in pt-PT: "o Vaulto",
 * never "a Vaulto". The ARY-1433 contract in translate.mjs already states this
 * to the translator, but nothing checked the output, so a blog post shipped
 * three feminine uses against 26 correct ones elsewhere in the corpus.
 *
 * Note the letter lookarounds `word()` adds are load-bearing here: a bare
 * /a Vaulto/ also matches "cont-a Vaulto" in "a sua conta Vaulto", where the
 * "a" agrees with "conta" and is perfectly correct. Match the sense, not the
 * string.
 *
 * The second rule catches the knock-on agreement, since fixing only the
 * article leaves "o Vaulto é gratuita". It lists the forms that actually occur
 * rather than a generic /\p{L}+a/, which would flag "o Vaulto é uma aplicação".
 */
const BRAND_AGREEMENT = [
  ['a\\s+Vaulto', 'masculine agreement: "o Vaulto"'],
  [
    'Vaulto\\s+(?:foi|é|era|será|seria|está|estava)\\s+'
      + '(?:criada|feita|concebida|desenhada|pensada|construída|projetada|'
      + 'fundada|lançada|gratuita|segura|privada|nova|própria)',
    'masculine agreement on the adjective/participle ("o Vaulto foi criado", "é gratuito")',
  ],
];

/** `tu`-form address. The house register is formal third person. */
const TU_FORMS = [
  'teu|tua|teus|tuas|contigo',
  'tens|podes|vês|estás|manténs|escolhes|forneces|capturas',
  'estiveres|quiseres|verás|poderes',
];

/**
 * Reviewed exceptions. An occurrence is excused only if it falls inside one of
 * these exact phrases. Add a line here (with a reason) rather than weakening a
 * rule above.
 */
const ALLOW = [
  // "arquivo" in its pt-PT sense: a physical archive / filing folder, not a file.
  'numa pasta de arquivo',
  'A cozinha, o arquivo, ou apenas as suas contas bancárias',
  // "você" where the pronoun is obligatory in pt-PT (copula complement / after
  // a preposition). The banned pattern is "você" as an ordinary subject.
  'comprova que é você',
  'entregá-los você mesmo',
  'perguntar-lhe o que só você sabe',
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

/** Collect the pt surfaces: one text blob per file. */
function surfaces(locale) {
  const files = [];
  for (const f of walk(CONTENT_DIR)) {
    if (f.endsWith(`/${locale}.json`)) {
      files.push({ file: f, text: strings(JSON.parse(readFileSync(f, 'utf8'))).join('\n') });
    }
  }
  for (const f of walk(join(BLOG_DIR, locale))) {
    if (f.endsWith('.md')) files.push({ file: f, text: readFileSync(f, 'utf8') });
  }
  return files;
}

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
  ...PT_BR_LEXICON,
  ...BRAND_AGREEMENT,
  ...TU_FORMS.map((t) => [t, 'formal third person ("o seu / a sua", 3rd-person verb)']),
];

let failures = 0;
let scanned = 0;
for (const { file, text } of surfaces('pt')) {
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
      'The pt locale is European Portuguese (pt-PT), formal third person.\n' +
      'See I18N.md → "Locale register & variant (pt)". If an occurrence is genuinely\n' +
      'correct pt-PT, add the exact phrase to ALLOW in scripts/check-locale-register.mjs.\n',
  );
  process.exit(1);
}
console.log(`pt locale register check passed — ${scanned} surfaces, pt-PT + formal third person.`);
