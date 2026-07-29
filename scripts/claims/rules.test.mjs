#!/usr/bin/env node
// Controls for the claims-guard rules themselves.
//
// A guard that reports "0 findings" is indistinguishable from a guard that never
// ran, so every rule has to be proven in BOTH directions: it must fire on the
// retired wording that was actually live, and it must stay green on the wording
// Brand & Trust approved as the replacement. A rule that only has must-fire
// examples is the failure mode that matters here — the replacement copy is a
// near-paraphrase of the retired copy, so an over-broad pattern would flag the
// fix as the defect.
//
// Controls live next to the pattern they defend, in banned-claims.json under
// `controls`. Run with `npm run guard:claims:test` (wired into `prebuild`).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const { rules } = JSON.parse(readFileSync(join(HERE, 'banned-claims.json'), 'utf8'))

const matches = (rule, text) =>
  rule.patterns.some((p) => new RegExp(p, 'i').test(text))

let failed = 0
let checked = 0
const uncovered = []

for (const rule of rules) {
  if (!rule.controls) {
    uncovered.push(rule.id)
    continue
  }
  const { mustFire = [], mustStayGreen = [] } = rule.controls
  for (const [samples, want] of [
    [mustFire, true],
    [mustStayGreen, false],
  ]) {
    for (const sample of samples) {
      checked++
      const got = matches(rule, sample)
      if (got === want) continue
      failed++
      const wanted = want ? 'should FIRE but is green' : 'should stay GREEN but fires'
      console.error(`  ✖ [${rule.id}] ${wanted}\n      ${sample}`)
    }
  }
}

console.log(`\nclaims rule controls — ${checked} assertions over ${rules.length} rules`)

if (uncovered.length) {
  // Not a failure: the rules seeded with the guard predate this harness. New
  // rules should carry controls, which is why they are named rather than
  // silently skipped — a silent skip reads as coverage.
  console.log(`\n  no controls yet (add \`controls\` when you next touch these):`)
  for (const id of uncovered) console.log(`    ${id}`)
}

if (failed) {
  console.error(`\n✖ ${failed} control${failed === 1 ? '' : 's'} failed\n`)
  process.exit(1)
}

console.log(`\n✓ all controls pass\n`)
