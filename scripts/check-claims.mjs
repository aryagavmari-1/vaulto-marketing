#!/usr/bin/env node
// Build-time guard against retired product claims in site copy (ARY-1340).
//
// Reads the generated rule set in scripts/claims/banned-claims.json — which is
// produced from the ❌ / retired rows of the ARY-23 §0 proof table by
// scripts/claims/sync-proof-table.mjs — and fails the build if any retired
// phrase appears in i18n JSON (all locales), blog markdown, or page templates.
//
//   npm run claims:check     standalone
//   npm run build            runs automatically via prebuild
//
// Legitimate uses are expressible with an inline allow marker carrying a reason.
// Use the comment syntax of the host file, and never an HTML comment in a page
// the reader is served — Astro emits `<!-- ... -->` straight into the rendered
// HTML, so a body marker leaks the retired claim into the public source. In
// markdown that means the frontmatter, as a YAML `#` comment:
//
//   ---
//   draft: false
//   # claims-allow: revocable-sharing — open-banking tokens at other providers,
//   #   not Vaulto sharing (C-003).
//   ---
//
// The same applies to `.astro`: an HTML comment there ships too, so use a `---`
// fence JS comment, not `<!-- ... -->`. Cite the immutable claim id (C-NNN);
// the legacy "§0 row N" numbering was retired by ARY-1338 and must not be cited.
//
// The marker exempts its rule id for the file it appears in, and every allowed
// hit is printed in the summary so an exemption stays a visible decision.
// See scripts/claims/README.md.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RULES_FILE = join(ROOT, 'scripts/claims/banned-claims.json')

// Copy surfaces the guard covers. Anything a reader can end up seeing.
const SCAN_DIRS = [
  'src/i18n', // i18n JSON (all 16 locales) + the .ts copy modules
  'src/content/blog', // English blog markdown
  'src/content/blog-i18n', // translated blog markdown
  'src/pages', // page templates
  'src/components', // page/section components
  'src/layouts',
  'src/config',
]
const SCAN_EXT = /\.(json|md|mdx|astro|ts|tsx)$/
const STALE_AFTER_DAYS = 90

// `claims-allow: <rule-id> — <reason>`; the reason is mandatory and must be
// substantive, so an exemption cannot be waved through as a bare suppression.
const ALLOW_MARKER = /claims-allow:\s*([a-z0-9][a-z0-9-]*)\s*(?:—|–|--|:)\s*([^\n\r"'*]*)/gi
const MIN_REASON_LENGTH = 12

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out // an optional surface (e.g. blog-i18n) may not exist yet
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (SCAN_EXT.test(entry)) out.push(full)
  }
  return out
}

function lineOf(text, index) {
  let line = 1
  for (let i = 0; i < index; i++) if (text[i] === '\n') line++
  return line
}

// Replace each allow marker with same-length whitespace so the marker's own
// text (which quotes the retired phrase) can't trip the rule it exempts, while
// every other offset in the file stays exact for line reporting.
function blankMarkers(text, markers) {
  let out = text
  for (const m of markers) {
    out = out.slice(0, m.start) + ' '.repeat(m.length) + out.slice(m.start + m.length)
  }
  return out
}

function collectAllows(text, filePath, problems) {
  const allows = new Map()
  const spans = []
  for (const match of text.matchAll(ALLOW_MARKER)) {
    const [raw, id, reasonRaw] = match
    spans.push({ start: match.index, length: raw.length })
    const reason = reasonRaw.trim().replace(/\s*(-->|\*\/)\s*$/, '').trim()
    if (reason.length < MIN_REASON_LENGTH) {
      problems.push(
        `${filePath}:${lineOf(text, match.index)}  allow marker for "${id}" has no usable reason.\n` +
          `    An exemption must state why the use is legitimate, e.g.\n` +
          `    claims-allow: ${id} — open-banking tokens at other providers, not Vaulto sharing`,
      )
      continue
    }
    allows.set(id.toLowerCase(), reason)
  }
  return { allows, spans }
}

function main() {
  let config
  try {
    config = JSON.parse(readFileSync(RULES_FILE, 'utf8'))
  } catch (err) {
    console.error(`\n✖ claims guard: cannot read ${relative(ROOT, RULES_FILE)} — ${err.message}`)
    console.error('  Regenerate it with: npm run claims:sync\n')
    process.exit(1)
  }

  const rules = config.rules.map((rule) => ({
    ...rule,
    regexes: rule.patterns.map((p) => new RegExp(p, 'gi')),
  }))

  const files = SCAN_DIRS.flatMap((dir) => walk(join(ROOT, dir)))
  const violations = []
  const allowed = []
  const problems = []
  const unusedAllows = []

  for (const file of files) {
    const rel = relative(ROOT, file)
    const raw = readFileSync(file, 'utf8')
    const { allows, spans } = collectAllows(raw, rel, problems)
    const text = spans.length ? blankMarkers(raw, spans) : raw
    const usedAllows = new Set()

    for (const rule of rules) {
      // Several patterns in one rule can match overlapping spans of the same
      // sentence; report the offence once, at its widest match.
      const spansHit = []
      for (const regex of rule.regexes) {
        regex.lastIndex = 0
        for (const match of text.matchAll(regex)) {
          spansHit.push({ start: match.index, end: match.index + match[0].length, text: match[0] })
        }
      }
      spansHit.sort((a, b) => a.start - b.start || b.end - a.end)
      const hits = []
      let covered = -1
      for (const span of spansHit) {
        if (span.start <= covered) continue
        covered = span.end - 1
        hits.push({ line: lineOf(text, span.start), text: span.text.replace(/\s+/g, ' ').trim() })
      }
      if (!hits.length) continue
      if (allows.has(rule.id)) {
        usedAllows.add(rule.id)
        allowed.push({ file: rel, rule, hits, reason: allows.get(rule.id) })
      } else {
        violations.push({ file: rel, rule, hits })
      }
    }

    for (const [id, reason] of allows) {
      if (!usedAllows.has(id)) unusedAllows.push({ file: rel, id, reason })
    }
  }

  const label = `${files.length} files · ${rules.length} retired-claim rules`
  console.log(`\nclaims guard — ARY-23 §0 proof table (deck rev ${config.sourceRevisionId?.slice(0, 8) ?? '?'})`)
  console.log(`  scanned ${label}`)

  if (allowed.length) {
    console.log('\n  allowed by inline marker (visible exemptions):')
    for (const a of allowed) {
      console.log(`    ${a.file} — ${a.rule.id} ×${a.hits.length}`)
      console.log(`      reason: ${a.reason}`)
    }
  }

  for (const u of unusedAllows) {
    console.log(`\n  note: ${u.file} allows "${u.id}" but nothing matches it — the marker can be removed.`)
  }

  // A stale rule set is a silent guard. Warn loudly rather than fail, so a
  // missed regeneration never blocks a deploy on its own.
  if (config.generatedAt) {
    const ageDays = Math.floor((Date.now() - Date.parse(config.generatedAt)) / 86400000)
    if (ageDays > STALE_AFTER_DAYS) {
      console.log(
        `\n  ⚠ rule set is ${ageDays} days old (generated ${config.generatedAt.slice(0, 10)}).` +
          `\n    Re-run "npm run claims:sync" so it reflects the current ARY-23 §0 table.`,
      )
    }
  }

  if (problems.length) {
    console.error('\n✖ claims guard: malformed allow markers\n')
    for (const p of problems) console.error(`  ${p}\n`)
  }

  if (violations.length) {
    const count = violations.reduce((n, v) => n + v.hits.length, 0)
    console.error(`\n✖ claims guard: ${count} retired claim${count === 1 ? '' : 's'} in site copy\n`)
    for (const v of violations) {
      console.error(`  ${v.rule.label}  (ARY-23 §0 ${v.rule.claim}) — ${v.rule.id}`)
      for (const hit of v.hits) console.error(`    ${v.file}:${hit.line}  “${hit.text}”`)
      console.error(`    why: ${v.rule.guidance}`)
      if (v.rule.instead) console.error(`    say instead: ${v.rule.instead}`)
      console.error(
        `    if this use is legitimate, mark it: claims-allow: ${v.rule.id} — <reason>\n`,
      )
    }
    console.error('  Source of truth: ARY-23 §0 proof table. Do not edit banned-claims.json by hand.\n')
  }

  if (problems.length || violations.length) process.exit(1)
  console.log('\n✓ no retired claims found\n')
}

main()
