#!/usr/bin/env node
/**
 * C-002 trust-band gate — the homepage isolation bullet, pinned.
 *
 * `src/i18n/content/home/<loc>.json` -> `trustBand.proof[3]` carries the C-002
 * isolation claim in 16 locales. This gate holds it, and the `/security` clause
 * it is lifted from, against literals pinned in this file.
 *
 * ## Why literals (ARY-1516)
 *
 * The predecessor (`scripts/ary1475-verify.py`, replaced by this file) read both
 * the value under test AND its reference out of git at the same rev. Two defects
 * fell out of that, both found by Brand & Trust during the ARY-1477 PASS:
 *
 *   1. Its `RETIRED` sub-check read the "old" string from `origin/master`, which
 *      already carried the fix — so `old !== expected` could never be true. A
 *      dead control that reads as an active one is worse than no control.
 *   2. The reference could move. It proved `home === security`, never that
 *      `security` still held the approved text, so a drift in `/security` was
 *      silently followed. That is the same shape as the ARY-1384 miss that
 *      self-reported 16/16 against a base 16 commits stale.
 *
 * Both are answered the same way: nothing here is read from a moving ref. The
 * approved clauses and the retired absolute are pinned below, so every check can
 * fail, and `REV=<rev>` reads only the CONTENT under test.
 *
 * Because the reference no longer moves, the predecessor's network staleness
 * guard is gone — a stale base can no longer score against a retired target.
 * That is what makes this safe to run in `prebuild`, which is the third half of
 * ARY-1516: the gate was never wired into anything, so it ran only when someone
 * remembered. It had in fact been red at `origin/master` since ARY-1481 moved
 * the `/security` clause, and nothing noticed.
 *
 * ## Changing the pins
 *
 * A pin is an approval record, not a cache. Editing one to make the build green
 * is how this gate goes quietly weaker; it needs a Brand & Trust ruling, and the
 * ruling id belongs in the commit message. Provenance: ARY-1277 approved the
 * clause, ARY-1373/1383/1384 retired the absolute, ARY-1424/1481 grew the
 * `/security` clause to its support-access form, ARY-2587 restored the app's own
 * vault noun (ARY-1389) in fr/hi/ja/ko/ru.
 *
 * Usage:
 *   node scripts/check-trust-band.mjs           # working tree (what prebuild runs)
 *   REV=<rev> node scripts/check-trust-band.mjs # read content at <rev> — the control
 */
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const LOCALES = [
  'ar', 'de', 'en', 'es', 'fr', 'hi', 'it', 'ja',
  'ko', 'nl', 'pl', 'pt', 'ru', 'sv', 'tr', 'zh',
]

// Sentence-final marks across the 16 shipped locales, not just ASCII: an
// ASCII-only set passes a stray Devanagari danda in `hi` silently.
export const TERMINAL_PUNCT = '.。．।۔!！?？'

export const PROOF_INDEX = 3

// The approved /security access-controls clause — `protections[-1].body`.
// Pinned so a drift on /security fails loudly instead of being followed home.
export const APPROVED_SECURITY = {
  ar: "خزنة كل شخص معزولة عن المستخدمين الآخرين، ولا يستطيع فريق الدعم لدينا الاطلاع على خزنتك — لا تتضمّن Vaulto أي نوع من حسابات الموظفين يمكنه فتح واحدة.",
  de: "Der Tresor jeder Person ist von anderen Nutzern isoliert, und unser Support-Team kann deinen Tresor nicht einsehen — Vaulto hat keine Mitarbeiter-Kontoart, die einen solchen öffnen könnte.",
  en: "Each person's vault is isolated from other users, and our support team cannot browse your vault — Vaulto has no staff account type that could open one.",
  es: "La bóveda de cada persona está aislada de los demás usuarios, y nuestro equipo de soporte no puede consultar tu bóveda: Vaulto no tiene ningún tipo de cuenta de personal que pudiera abrirla.",
  fr: "Le coffre de chaque personne est isolé des autres utilisateurs, et notre équipe d’assistance ne peut pas consulter votre coffre — Vaulto n’a aucun type de compte interne qui permettrait d’en ouvrir un.",
  hi: "हर व्यक्ति का वॉल्ट दूसरे उपयोगकर्ताओं से अलग रहता है, और हमारी सहायता टीम आपका वॉल्ट नहीं देख सकती — Vaulto में कर्मचारियों के लिए ऐसा कोई खाता प्रकार नहीं है जो उसे खोल सके।",
  it: "La cassaforte di ogni persona è isolata dagli altri utenti e il nostro team di assistenza non può consultare la tua cassaforte — Vaulto non ha alcun tipo di account per il personale che possa aprirne una.",
  ja: "一人ひとりの保管庫は他のユーザーから分離されており、当社のサポートチームがあなたの保管庫を閲覧することはできません。Vaulto には、あなたの保管庫を開けるような従業員向けのアカウント種別はありません。",
  ko: "각 사용자의 보관함은 다른 사용자와 분리되어 있으며, 저희 지원팀은 사용자의 보관함을 열람할 수 없습니다. Vaulto에는 사용자의 보관함을 열 수 있는 직원용 계정 유형이 없습니다.",
  nl: "De kluis van elke persoon is geïsoleerd van andere gebruikers, en ons supportteam kan je kluis niet inzien — Vaulto heeft geen accounttype voor medewerkers dat er een zou kunnen openen.",
  pl: "Sejf każdej osoby jest odizolowany od innych użytkowników, a nasz zespół wsparcia nie może przeglądać Twojego sejfu — Vaulto nie ma żadnego rodzaju konta dla pracowników, które mogłoby go otworzyć.",
  pt: "O cofre de cada pessoa está isolado dos outros utilizadores e a nossa equipa de apoio não pode consultar o seu cofre — o Vaulto não tem qualquer tipo de conta para funcionários que o pudesse abrir.",
  ru: "Хранилище каждого пользователя изолировано от других пользователей, а наша служба поддержки не может просматривать ваше хранилище — в Vaulto нет типа учётной записи для сотрудников, который позволил бы его открыть.",
  sv: "Varje persons valv är isolerat från andra användare, och vårt supportteam kan inte se ditt valv — Vaulto har ingen kontotyp för anställda som skulle kunna öppna ett sådant.",
  tr: "Her kişinin kasası diğer kullanıcılardan yalıtılmıştır ve destek ekibimiz kasanızı görüntüleyemez — Vaulto’da kasanızı açabilecek bir çalışan hesabı türü yoktur.",
  zh: "每个人的保险库都与其他用户相互隔离，我们的支持团队也无法浏览你的保险库——Vaulto 没有可以打开你的保险库的员工账户类型。",
}

// The approved homepage trust-band bullet. For 11 locales this is the /security
// clause truncated at its first clause boundary, byte for byte. For ja and ko
// that boundary lands on a continuative ending (分離されており / 있으며) that
// cannot stand alone, so the bullet keeps its own sentence-final form and only
// the vault noun is shared — hence LINKAGE below compares a common prefix
// rather than demanding a strict prefix.
export const APPROVED_TRUST_BAND = {
  ar: "خزنة كل شخص معزولة عن المستخدمين الآخرين",
  de: "Der Tresor jeder Person ist von anderen Nutzern isoliert",
  en: "Each person's vault is isolated from other users",
  es: "La bóveda de cada persona está aislada de los demás usuarios",
  fr: "Le coffre de chaque personne est isolé des autres utilisateurs",
  hi: "हर व्यक्ति का वॉल्ट दूसरे उपयोगकर्ताओं से अलग रहता है",
  it: "La cassaforte di ogni persona è isolata dagli altri utenti",
  ja: "一人ひとりの保管庫は他のユーザーから分離されています",
  ko: "각 사용자의 보관함은 다른 사용자와 분리되어 있습니다",
  nl: "De kluis van elke persoon is geïsoleerd van andere gebruikers",
  pl: "Sejf każdej osoby jest odizolowany od innych użytkowników",
  pt: "O cofre de cada pessoa está isolado dos outros utilizadores",
  ru: "Хранилище каждого пользователя изолировано от других пользователей",
  sv: "Varje persons valv är isolerat från andra användare",
  tr: "Her kişinin kasası diğer kullanıcılardan yalıtılmıştır",
  zh: "每个人的保险库都与其他用户相互隔离",
}

// The ARY-1373 absolute, as it was actually live before 3fced73 retired it.
// Pinned from that commit's parent; naming it is the whole point of the RETIRED
// check, which could not fire while it was read from a ref carrying the fix.
export const RETIRED_ABSOLUTE = {
  ar: "لا يمكنك رؤية إلا خزنتك الخاصة فقط",
  de: "Du kannst immer nur deinen eigenen Tresor sehen",
  en: "You can only ever see your own vault",
  es: "Solo tú puedes ver tu propia bóveda",
  fr: "Vous ne pouvez voir que votre propre coffre-fort",
  hi: "आप केवल अपनी ही तिजोरी देख सकते हैं",
  it: "Puoi vedere solo la tua cassaforte",
  ja: "見られるのは常に自分自身の金庫だけ",
  ko: "귀하는 오직 자신의 금고만 볼 수 있습니다",
  nl: "Je kunt alleen je eigen kluis zien",
  pl: "Możesz zobaczyć tylko swój własny sejf",
  pt: "Só pode ver o seu próprio cofre",
  ru: "Вы можете видеть только свой сейф",
  sv: "Du kan bara någonsin se ditt eget valv",
  tr: "Yalnızca kendi kasanı görebilirsin",
  zh: "你始终只能查看你自己的保险柜",
}

const fail = (msg) => {
  console.error(`\n✖ ${msg}\n`)
  process.exit(2)
}

/**
 * The pins have to be internally consistent or the checks below are theatre.
 * Runs on every invocation — it is three loops over 16 strings.
 */
export function checkPins() {
  const problems = []
  for (const [name, table] of Object.entries({
    APPROVED_SECURITY, APPROVED_TRUST_BAND, RETIRED_ABSOLUTE,
  })) {
    const keys = Object.keys(table)
    const missing = LOCALES.filter((l) => !keys.includes(l))
    const extra = keys.filter((l) => !LOCALES.includes(l))
    if (missing.length) problems.push(`${name} missing ${missing.join(', ')}`)
    if (extra.length) problems.push(`${name} has unknown locale ${extra.join(', ')}`)
    for (const l of keys) {
      if (!table[l] || !table[l].trim()) problems.push(`${name}.${l} is empty`)
    }
  }
  for (const l of LOCALES) {
    const band = APPROVED_TRUST_BAND[l]
    const sec = APPROVED_SECURITY[l]
    if (!band || !sec) continue
    if (TERMINAL_PUNCT.includes(band.at(-1))) {
      problems.push(
        `APPROVED_TRUST_BAND.${l} ends in terminal punctuation ${JSON.stringify(band.at(-1))}`)
    }
    // If these two were ever pinned equal, RETIRED could never be distinguished
    // from IDENTITY again — that is defect #1 growing back.
    if (band === RETIRED_ABSOLUTE[l]) {
      problems.push(`APPROVED_TRUST_BAND.${l} === RETIRED_ABSOLUTE.${l} — RETIRED can never fire`)
    }
    // LINKAGE: the bullet is still the opening of the approved /security clause.
    // Compared as a common prefix, not a strict one, for the ja/ko reason above.
    // A bad noun swap that breaks a particle (ko 보관함 takes 은, not 는) diverges
    // early and trips this.
    let i = 0
    while (i < band.length && i < sec.length && band[i] === sec[i]) i += 1
    if (i < band.length - 6) {
      problems.push(
        `LINKAGE ${l}: trust-band pin diverges from the /security pin at char ${i} of ${band.length}`)
    }
  }
  return problems
}

const REV = (process.env.REV ?? '').trim()

function readJson(path) {
  if (REV) {
    let raw
    try {
      raw = execFileSync('git', ['show', `${REV}:${path}`], { encoding: 'utf8' })
    } catch (err) {
      fail(`cannot read ${path} at ${REV}: ${String(err.stderr ?? err.message).trim()}`)
    }
    return JSON.parse(raw)
  }
  return JSON.parse(readFileSync(path, 'utf8'))
}

/**
 * Every problem with one locale. Pure — the test drives it with fixtures, which
 * is what keeps Control A / Control B from being a thing someone runs by hand.
 */
export function checkLocale(loc, home, security) {
  const problems = []

  const clause = security?.protections?.at(-1)?.body
  if (typeof clause !== 'string') {
    problems.push('SHAPE (security protections[-1].body is missing)')
  } else if (clause.trimEnd() !== APPROVED_SECURITY[loc]) {
    problems.push(
      `SECURITY (/security drifted from the approved clause: want ${JSON.stringify(APPROVED_SECURITY[loc])}, got ${JSON.stringify(clause.trimEnd())})`)
  }

  const proof = home?.trustBand?.proof
  if (!Array.isArray(proof) || typeof proof[PROOF_INDEX] !== 'string') {
    problems.push(`SHAPE (home trustBand.proof[${PROOF_INDEX}] is missing)`)
    return problems
  }

  const value = proof[PROOF_INDEX]
  const expected = APPROVED_TRUST_BAND[loc]
  if (value !== expected) {
    // Name the ARY-1373 absolute when it is what survived. The two failures want
    // different fixes, and reporting both as IDENTITY is what hid defect #1.
    problems.push(value === RETIRED_ABSOLUTE[loc]
      ? 'RETIRED (still the ARY-1373 absolute)'
      : `IDENTITY (want ${JSON.stringify(expected)}, got ${JSON.stringify(value)})`)
  }

  proof.forEach((sibling, i) => {
    if (typeof sibling === 'string' && sibling && TERMINAL_PUNCT.includes(sibling.at(-1))) {
      problems.push(`UNPUNCTUATED (proof[${i}] ends ${JSON.stringify(sibling.at(-1))})`)
    }
  })

  return problems
}

function main() {
  console.log(`C-002 trust-band gate (ARY-1516) — content rev: ${REV || 'working tree'}`)

  const pinProblems = checkPins()
  if (pinProblems.length) {
    for (const p of pinProblems) console.error(`  ! ${p}`)
    fail('the pins are inconsistent — fix them before trusting any result below')
  }
  console.log(`  pins: ${LOCALES.length} locales, self-check clean`)

  const failures = []
  for (const loc of LOCALES) {
    const home = readJson(`src/i18n/content/home/${loc}.json`)
    const security = readJson(`src/i18n/content/security/${loc}.json`)
    const problems = checkLocale(loc, home, security)
    if (problems.length) {
      failures.push(loc)
      console.log(`  ${loc}  FAIL  ${problems.join('; ')}`)
    } else {
      console.log(`  ${loc}  PASS  ${home.trustBand.proof[PROOF_INDEX]}`)
    }
  }

  const passed = LOCALES.length - failures.length
  console.log(`\n  ${passed}/${LOCALES.length} PASS · ${failures.length}/${LOCALES.length} FAIL`)
  if (failures.length) {
    console.error(`  ✗ gate FAILED: ${failures.join(', ')}\n`)
    return 1
  }
  console.log('  ✓ gate PASSED\n')
  return 0
}

// Run only when invoked directly, so the test file can import the pure helpers.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main())
}
