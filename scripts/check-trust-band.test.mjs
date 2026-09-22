#!/usr/bin/env node
// Controls for the C-002 trust-band gate itself (ARY-1516).
//
// The defect this file exists to prevent is not a wrong claim reaching the
// homepage — that is what check-trust-band.mjs is for. It is a *check that
// cannot fire*. The predecessor's RETIRED sub-check read the retired string from
// a ref that already carried the fix, so it was dead code wearing the costume of
// an active control, and the only thing that caught it was a reviewer manually
// restoring the old copy during the ARY-1477 PASS.
//
// So every check gets both directions here, driven through the pure
// `checkLocale`: the approved fixture must produce zero problems, and a
// hand-built violation must produce that specific problem code. Run by
// `prebuild` ahead of the gate — a check that stops firing fails the deploy
// instead of going quiet.

import {
  LOCALES,
  PROOF_INDEX,
  APPROVED_SECURITY,
  APPROVED_TRUST_BAND,
  RETIRED_ABSOLUTE,
  checkLocale,
  checkPins,
} from './check-trust-band.mjs'

let failed = 0
let checked = 0

const assert = (label, ok, detail = '') => {
  checked += 1
  if (ok) return
  failed += 1
  console.error(`  ✖ ${label}${detail ? ` — ${detail}` : ''}`)
}

// The approved state, rebuilt from the pins rather than read off disk: these
// controls prove the checks fire, not that today's tree happens to be green.
const approved = (loc) => ({
  home: {
    trustBand: {
      proof: ['siblingA', 'siblingB', 'siblingC', APPROVED_TRUST_BAND[loc]],
    },
  },
  security: { protections: [{ body: 'unrelated' }, { body: APPROVED_SECURITY[loc] }] },
})

const codes = (problems) => problems.map((p) => p.split(' ')[0])

console.log('C-002 trust-band gate controls (ARY-1516)\n')

// 0. The pin self-check must be clean, or nothing below means anything.
assert('pins self-check is clean', checkPins().length === 0, checkPins().join('; '))

for (const loc of LOCALES) {
  const { home, security } = approved(loc)

  // Baseline: the approved fixture is silent. Without this, an over-broad check
  // would "pass" every negative control while flagging the correct copy.
  assert(`${loc} approved fixture is clean`,
    checkLocale(loc, home, security).length === 0,
    checkLocale(loc, home, security).join('; '))

  // Control A — a near-miss reword. Says the same thing, is not the approved
  // bytes. Two shapes, because byte identity has to be strict in both
  // directions: copy that was shortened, and copy that only differs in
  // whitespace (the shape a translation-tool round trip produces).
  for (const [shape, value] of [
    ['reworded', APPROVED_TRUST_BAND[loc].slice(0, -3)],
    ['whitespace', `${APPROVED_TRUST_BAND[loc]} `],
  ]) {
    const paraphrased = structuredClone(home)
    paraphrased.trustBand.proof[PROOF_INDEX] = value
    assert(`${loc} Control A (${shape}) reports IDENTITY`,
      codes(checkLocale(loc, paraphrased, security)).includes('IDENTITY'))
  }

  // Control B — the ARY-1373 absolute restored. This is the one that was dead:
  // it must report RETIRED by name, NOT fall through to a generic IDENTITY.
  const retired = structuredClone(home)
  retired.trustBand.proof[PROOF_INDEX] = RETIRED_ABSOLUTE[loc]
  const retiredCodes = codes(checkLocale(loc, retired, security))
  assert(`${loc} Control B (retired absolute) reports RETIRED`,
    retiredCodes.includes('RETIRED'), retiredCodes.join(', ') || 'no problems at all')
  assert(`${loc} Control B does not degrade to IDENTITY`,
    !retiredCodes.includes('IDENTITY'), retiredCodes.join(', '))

  // Control C — /security drifts away from the approved clause. The predecessor
  // followed this silently, because it read the reference from the same tree.
  const drifted = structuredClone(security)
  drifted.protections.at(-1).body = `${APPROVED_SECURITY[loc]} Extra unapproved sentence.`
  assert(`${loc} Control C (/security drift) reports SECURITY`,
    codes(checkLocale(loc, home, drifted)).includes('SECURITY'))

  // Control C' — the drift must be caught on its own, not only as a side effect
  // of the homepage bullet also being wrong.
  assert(`${loc} Control C leaves the homepage bullet passing`,
    !codes(checkLocale(loc, home, drifted)).includes('IDENTITY'))

  // Control D — terminal punctuation, on a sibling rather than the bullet, so a
  // check scoped only to proof[3] is caught.
  const punctuated = structuredClone(home)
  punctuated.trustBand.proof[0] = 'siblingA.'
  assert(`${loc} Control D (punctuated sibling) reports UNPUNCTUATED`,
    codes(checkLocale(loc, punctuated, security)).includes('UNPUNCTUATED'))

  // Control E — missing/renamed structure must fail, not throw or pass.
  assert(`${loc} Control E (missing proof) reports SHAPE`,
    codes(checkLocale(loc, { trustBand: {} }, security)).includes('SHAPE'))
}

// The retired string and the approved bullet must stay distinguishable in every
// locale, otherwise Control B is satisfiable by an inert check again.
for (const loc of LOCALES) {
  assert(`${loc} retired pin differs from the approved pin`,
    RETIRED_ABSOLUTE[loc] !== APPROVED_TRUST_BAND[loc])
}

console.log(`trust-band gate controls — ${checked} assertions over ${LOCALES.length} locales`)

if (failed) {
  console.error(`\n✖ ${failed} control${failed === 1 ? '' : 's'} failed\n`)
  process.exit(1)
}

console.log('\n✓ all controls pass\n')
