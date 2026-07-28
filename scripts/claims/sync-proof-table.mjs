#!/usr/bin/env node
// Regenerate scripts/claims/banned-claims.json from the ARY-23 §0 proof table
// (ARY-1340). The proof table is the single source of truth for what we may
// claim; this script is the only sanctioned way to produce the guard's rule set.
//
//   npm run claims:sync
//
// Requires PAPERCLIP_API_URL + PAPERCLIP_API_KEY (present inside any Paperclip
// agent run). It reads the `positioning-deck` document on ARY-23 and expects:
//
//   1. the §0 capability table, and
//   2. a fenced ```claims-guard block directly beneath it holding the
//      machine-readable patterns for each retired row.
//
// The two are cross-checked: every retired row in the table must be covered by
// either a `rules` entry (enforced by regex) or a `notPatterned` entry (an
// explicit, reasoned decision not to). If a row is retired and neither exists,
// this script fails. That is the anti-drift property — you cannot retire a claim
// in the table and silently forget to guard it.

import { writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ISSUE_ID = '6011fd4e-1802-4d4e-b9cb-e114abed6aab' // ARY-23
const DOC_KEY = 'positioning-deck'
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'banned-claims.json')

// CLAIMS_DECK_FILE lets you dry-run a §0 edit against a local copy of the deck
// before committing it to ARY-23. The API path is the real one.
let body, revisionId
if (process.env.CLAIMS_DECK_FILE) {
  body = readFileSync(process.env.CLAIMS_DECK_FILE, 'utf8')
  revisionId = `local:${process.env.CLAIMS_DECK_FILE}`
  console.log(`(dry run against ${process.env.CLAIMS_DECK_FILE})`)
} else {
  const apiUrl = process.env.PAPERCLIP_API_URL
  const apiKey = process.env.PAPERCLIP_API_KEY
  if (!apiUrl || !apiKey) {
    console.error('✖ PAPERCLIP_API_URL and PAPERCLIP_API_KEY must be set to reach ARY-23.')
    process.exit(1)
  }
  const res = await fetch(`${apiUrl}/api/issues/${ISSUE_ID}/documents/${DOC_KEY}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) {
    console.error(`✖ could not fetch ARY-23 ${DOC_KEY}: HTTP ${res.status}`)
    process.exit(1)
  }
  const doc = await res.json()
  body = doc.body ?? doc.document?.body
  revisionId = doc.latestRevisionId ?? doc.revisionId ?? doc.document?.latestRevisionId ?? null
}
if (!body) {
  console.error('✖ ARY-23 positioning-deck came back empty — refusing to generate from nothing.')
  process.exit(1)
}

// --- 1. the §0 table: which rows are retired? -------------------------------

const section0 = body.match(/\n##\s*0\.[\s\S]*?(?=\n##\s*\d)/)?.[0]
if (!section0) {
  console.error('✖ could not find §0 ("## 0. …") in the deck — the document structure has changed.')
  process.exit(1)
}
// Columns are located by header name, not position: the table gained a "Legacy #"
// column when claims were given immutable C-NNN ids (ARY-1338), and a positional
// parser would have silently read the wrong cells.
const tableLines = section0.split('\n').filter((l) => l.trim().startsWith('|'))
const cellsOf = (line) => line.split('|').slice(1, -1).map((c) => c.trim())

const headerLine = tableLines.find((l) => /\bShipped\?/i.test(l))
if (!headerLine) {
  console.error('✖ no "Shipped?" header found in the §0 table — the table format has changed.')
  process.exit(1)
}
const header = cellsOf(headerLine).map((h) => h.replace(/\*/g, '').toLowerCase())
const idCol = header.findIndex((h) => h === 'id')
const claimCol = header.findIndex((h) => h.includes('copy claim'))
const shippedCol = header.findIndex((h) => h.includes('shipped'))
if (idCol < 0 || claimCol < 0 || shippedCol < 0) {
  console.error(`✖ §0 table is missing an ID / Copy claim / Shipped? column — got: ${header.join(' | ')}`)
  process.exit(1)
}

const tableRows = []
for (const line of tableLines.slice(tableLines.indexOf(headerLine) + 1)) {
  const cells = cellsOf(line)
  if (cells.length <= shippedCol) continue
  const id = cells[idCol].replace(/\*/g, '').trim()
  if (!/^C-\d+$/.test(id)) continue // separator rows, and any non-claim row
  const claim = cells[claimCol]
  const shipped = cells[shippedCol]
  // A claim is "retired" if it is ❌, ⚠️, struck through, or had to be reworded or
  // corrected — each means some previously-approved wording must never ship again.
  const retired =
    shipped.includes('❌') ||
    shipped.includes('⚠️') ||
    /reworded|corrected|retired/i.test(shipped) ||
    /~~/.test(claim)
  if (retired) tableRows.push({ claim: id, text: claim, shipped })
}

if (!tableRows.length) {
  console.error('✖ parsed 0 retired claims from the §0 table — the table format has changed.')
  process.exit(1)
}

// --- 2. the claims-guard block: the patterns for those rows -----------------

const block = body.match(/```claims-guard\n([\s\S]*?)```/)
if (!block) {
  console.error('✖ ARY-23 §0 has no ```claims-guard block. The guard cannot be generated without it.')
  process.exit(1)
}
const guard = JSON.parse(block[1])

// --- 3. cross-check: no retired row may go unaccounted for ------------------

const covered = new Set([
  ...guard.rules.flatMap((r) => (Array.isArray(r.claims) ? r.claims : [r.claim])),
  ...guard.notPatterned.map((n) => n.claim),
])

const uncovered = tableRows.filter((r) => !covered.has(r.claim))
if (uncovered.length) {
  console.error('\n✖ these §0 claims are retired but the claims-guard block does not account for them:\n')
  for (const r of uncovered) console.error(`   ${r.claim} — ${r.text.slice(0, 90)}`)
  console.error(
    '\n  Add a `rules` entry (a regex the build will enforce) or a `notPatterned`\n' +
      '  entry (an explicit reason a regex cannot express it) to the claims-guard\n' +
      '  block in ARY-23 §0, then re-run this script.\n',
  )
  process.exit(1)
}

for (const rule of guard.rules) {
  for (const p of rule.patterns) {
    try {
      new RegExp(p, 'gi')
    } catch (err) {
      console.error(`✖ rule "${rule.id}" has an invalid pattern ${JSON.stringify(p)}: ${err.message}`)
      process.exit(1)
    }
  }
}

// --- 4. write the generated rule set ---------------------------------------

const out = {
  $comment:
    'GENERATED FILE — do not edit by hand. Produced by scripts/claims/sync-proof-table.mjs ' +
    'from the ARY-23 §0 proof table (the single source of truth for product claims). ' +
    'To retire a claim: update the §0 row and its claims-guard entry in ARY-23, then run `npm run claims:sync`.',
  source: 'ARY-23 #document-positioning-deck §0',
  sourceRevisionId: revisionId,
  generatedAt: new Date().toISOString(),
  retiredClaimsInTable: tableRows.map((r) => r.claim),
  rules: guard.rules,
  notPatterned: guard.notPatterned,
}

writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n')
console.log(
  `✓ banned-claims.json regenerated — ${guard.rules.length} enforced rules, ` +
    `${guard.notPatterned.length} claims deliberately not patterned, ` +
    `${tableRows.length} retired §0 claims all accounted for.`,
)
