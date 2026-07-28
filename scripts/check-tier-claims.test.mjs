#!/usr/bin/env node
/**
 * check-tier-claims.test.mjs — ARY-1381
 *
 * Controls for check-tier-claims.mjs, run against throwaway fixture trees via
 * TIER_CLAIMS_ROOT.
 *
 * Why this file exists. The guard's failure mode is not a crash — it is silence.
 * ARY-1381 was filed because every pattern was English while the corpus was 93%
 * translated, and the guard printed `✓` over all of it. Writing 15 more pattern
 * sets does not fix that on its own: a pattern set that never matches anything
 * looks exactly the same from the outside as a corpus that is clean. Two of the
 * sets in the first draft of this change (pl, ru) were in fact inert — `\w*`
 * cannot consume a Cyrillic or Polish inflection — and the corpus scan reported
 * them as 32 files evaluated, 0 findings.
 *
 * So every assertion here is paired. For each locale we check that the guard
 * FIRES on an over-claim and STAYS QUIET on the same nouns without a free-tier
 * marker. A pattern list that matches nothing fails the first; a pattern list
 * that matches everything fails the second.
 *
 * The fixture strings are the app's own shipped translations, lifted from
 * lib/i18n/src/translations.ts in the Asset-Vault repo — not re-derived from
 * the regexes they test. If a translator rewords a section heading, this test
 * is what notices that the guard no longer recognises it.
 *
 * Run: node scripts/check-tier-claims.test.mjs
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GUARD = fileURLToPath(new URL("./check-tier-claims.mjs", import.meta.url));

/**
 * Per-locale fixture vocabulary.
 *
 * `free`       — advisory.yourFreeOverview
 * `paid`       — advisory.yourDetailedReport
 * capabilities — advisory.riskAreas / recommendedNextSteps / considerations /
 *                assetBreakdown / riskProjection
 *
 * `considerations` is deliberately absent for every locale: the shipped heading
 * is the bare noun ("Considerations", "Overwegingen", "고려 사항"), which is far
 * too common in ordinary prose to match on without a qualifier. The guard only
 * claims the qualified forms ("key considerations", "aspetti da considerare"),
 * and this table only asserts what the guard claims. Widening it is a copy
 * decision, not a regex decision — see the ARY-1381 follow-up.
 */
const FIXTURES = {
  en: {
    free: "Your free overview",
    paid: "Your detailed report",
    caps: {
      riskAreas: "Risk areas",
      recommendedActions: "Your action plan",
      assetBreakdown: "Asset breakdown",
      riskProjection: "Risk projection",
    },
  },
  es: {
    free: "Tu resumen gratuito",
    paid: "Tu informe detallado",
    caps: {
      riskAreas: "Áreas de riesgo",
      recommendedActions: "Tu plan de acción",
      assetBreakdown: "Desglose de activos",
      riskProjection: "Proyección de riesgos",
    },
  },
  fr: {
    free: "Votre aperçu gratuit",
    paid: "Votre rapport détaillé",
    caps: {
      riskAreas: "Zones de risque",
      recommendedActions: "Votre plan d'action",
      assetBreakdown: "Répartition des actifs",
      riskProjection: "Projection des risques",
    },
  },
  pt: {
    free: "A sua visão geral gratuita",
    paid: "O seu relatório detalhado",
    caps: {
      riskAreas: "Áreas de risco",
      recommendedActions: "O seu plano de ação",
      assetBreakdown: "Detalhamento dos ativos",
      riskProjection: "Projeção de riscos",
    },
  },
  de: {
    free: "Ihre kostenlose Übersicht",
    paid: "Ihr ausführlicher Bericht",
    caps: {
      riskAreas: "Risikobereiche",
      recommendedActions: "Ihr Aktionsplan",
      assetBreakdown: "Vermögensaufschlüsselung",
      riskProjection: "Risikoprognose",
    },
  },
  it: {
    free: "La tua panoramica gratuita",
    paid: "Il tuo report dettagliato",
    caps: {
      riskAreas: "Aree di rischio",
      recommendedActions: "Il tuo piano d'azione",
      assetBreakdown: "Ripartizione del patrimonio",
      riskProjection: "Proiezione del rischio",
    },
  },
  nl: {
    free: "Je gratis overzicht",
    paid: "Je gedetailleerde rapport",
    caps: {
      riskAreas: "Risicogebieden",
      recommendedActions: "Jouw actieplan",
      assetBreakdown: "Uitsplitsing van bezittingen",
      riskProjection: "Risicoprognose",
    },
  },
  zh: {
    free: "您的免费概览",
    paid: "您的详细报告",
    caps: {
      riskAreas: "风险领域",
      recommendedActions: "您的行动计划",
      assetBreakdown: "资产明细",
      riskProjection: "风险预测",
    },
  },
  ja: {
    free: "無料の概要",
    paid: "詳細レポート",
    caps: {
      riskAreas: "リスク領域",
      recommendedActions: "あなたのアクションプラン",
      assetBreakdown: "資産の内訳",
      riskProjection: "リスク予測",
    },
  },
  ar: {
    free: "نظرتك العامة المجانية",
    paid: "تقريرك المفصّل",
    caps: {
      riskAreas: "مجالات الخطر",
      recommendedActions: "خطة عملك",
      assetBreakdown: "تفصيل الأصول",
      riskProjection: "توقعات المخاطر",
    },
  },
  hi: {
    free: "आपका मुफ़्त अवलोकन",
    paid: "आपकी विस्तृत रिपोर्ट",
    caps: {
      riskAreas: "जोखिम वाले क्षेत्र",
      recommendedActions: "आपकी कार्य योजना",
      assetBreakdown: "संपत्ति का विवरण",
      riskProjection: "जोखिम अनुमान",
    },
  },
  ru: {
    free: "Ваш бесплатный обзор",
    paid: "Ваш подробный отчёт",
    caps: {
      riskAreas: "Зоны риска",
      recommendedActions: "Ваш план действий",
      assetBreakdown: "Разбивка активов",
      riskProjection: "Прогноз рисков",
    },
  },
  pl: {
    free: "Twój bezpłatny przegląd",
    paid: "Twój szczegółowy raport",
    caps: {
      riskAreas: "Obszary ryzyka",
      recommendedActions: "Twój plan działania",
      assetBreakdown: "Podział aktywów",
      riskProjection: "Prognoza ryzyka",
    },
  },
  tr: {
    free: "Ücretsiz genel bakışınız",
    paid: "Ayrıntılı raporunuz",
    caps: {
      riskAreas: "Risk alanları",
      recommendedActions: "Eylem planınız",
      assetBreakdown: "Varlık dökümü",
      riskProjection: "Risk öngörüsü",
    },
  },
  ko: {
    free: "무료 개요",
    paid: "상세 보고서",
    caps: {
      riskAreas: "위험 영역",
      recommendedActions: "나의 실행 계획",
      assetBreakdown: "자산 상세 내역",
      riskProjection: "위험 예측",
    },
  },
  sv: {
    free: "Din kostnadsfria översikt",
    paid: "Din detaljerade rapport",
    caps: {
      riskAreas: "Riskområden",
      recommendedActions: "Din handlingsplan",
      assetBreakdown: "Tillgångsfördelning",
      riskProjection: "Riskprognos",
    },
  },
};

/** Where a fixture for `locale` has to live for the guard to detect its locale. */
function fixturePath(locale, name) {
  return locale === "en"
    ? `src/content/blog/${name}.md`
    : `src/content/blog-i18n/${locale}/${name}.md`;
}

function run(files) {
  const root = mkdtempSync(join(tmpdir(), "tier-claims-fixture-"));
  try {
    for (const [rel, body] of Object.entries(files)) {
      const full = join(root, rel);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, body, "utf8");
    }
    let stdout = "";
    let status = 0;
    try {
      stdout = execFileSync(process.execPath, [GUARD], {
        env: { ...process.env, TIER_CLAIMS_ROOT: root },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      status = err.status ?? 1;
      stdout = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    }
    return { status, out: stdout };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

let failures = 0;
let checks = 0;
function check(name, ok, detail = "") {
  checks += 1;
  if (ok) return;
  failures += 1;
  console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ""}`);
}

// ---------------------------------------------------------------------------
// 1. The ARY-1381 reproduction: the same over-claim in English and in German.
//    Before this change the English copy failed and the German copy passed.
// ---------------------------------------------------------------------------
console.log("1. ARY-1381 reproduction — same over-claim, two languages");
{
  const { status, out } = run({
    "src/content/blog/control-en.md":
      "You can run a free AI overview of your situation. It surfaces the risk " +
      "areas that matter, along with recommended actions to take.\n",
    "src/content/blog-i18n/de/control-de.md":
      "Du kannst eine kostenlose KI-Übersicht ausführen. Sie zeigt die " +
      "wichtigen Risikobereiche sowie empfohlene Maßnahmen, die du ergreifen " +
      "solltest.\n",
  });
  check("exits 1", status === 1, `got ${status}`);
  check("flags the English control", /control-en\.md/.test(out));
  check("flags the German control", /control-de\.md/.test(out), out.slice(0, 400));
  check("names the German locale", /\[de\]/.test(out));
  check("finds riskAreas in German", /control-de[\s\S]*?riskAreas|riskAreas[\s\S]*?control-de/.test(out));
}

// ---------------------------------------------------------------------------
// 2. Fail closed: a locale with no pattern set is reported, never passed over.
// ---------------------------------------------------------------------------
console.log("2. Fail-closed on an unknown locale");
{
  const { status, out } = run({
    "src/content/blog-i18n/xx/post.md": "Ordinary copy with nothing to flag.\n",
  });
  check("exits 2 (unverifiable, no over-claims)", status === 2, `got ${status}`);
  check("names the locale", /\bxx: 1 file\(s\)/.test(out), out.slice(0, 400));
  check("does NOT print the clean tick", !/✓ tier-claims/.test(out));
  check("reports it as not evaluated", /NOT evaluated/.test(out));
}
{
  // Over-claims outrank unverifiable files: exit 1 still wins, and both are shown.
  const { status, out } = run({
    "src/content/blog-i18n/xx/post.md": "Ordinary copy.\n",
    "src/content/blog/bad.md": "A free overview with your risk areas.\n",
  });
  check("over-claim + unverifiable exits 1", status === 1, `got ${status}`);
  check("still reports the unverifiable file", /\bxx: 1 file\(s\)/.test(out));
}
{
  // …and the same tree with a known locale is clean, so exit 2 above is caused
  // by the unknown locale and not by the fixture's mere existence.
  const { status, out } = run({
    "src/content/blog-i18n/de/post.md": "Ordinary copy with nothing to flag.\n",
  });
  check("known locale, benign copy, exits 0", status === 0, `got ${status}`);
  check("prints the clean tick", /✓ tier-claims/.test(out));
  check("counts the file as evaluated", /1 file\(s\) evaluated/.test(out));
}

// ---------------------------------------------------------------------------
// 3. Every locale, every capability: fires on an over-claim …
// ---------------------------------------------------------------------------
console.log("3. Per-locale detection (positive control)");
for (const [locale, fx] of Object.entries(FIXTURES)) {
  for (const [field, noun] of Object.entries(fx.caps)) {
    const { status, out } = run({
      [fixturePath(locale, `pos-${field}`)]: `${fx.free}. ${noun}.\n`,
    });
    check(
      `${locale}/${field} is detected`,
      status === 1 && out.includes(`AdvisoryReport.${field}`),
      `exit ${status}; guard said: ${out.replace(/\s+/g, " ").slice(0, 200)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// 4. … and stays quiet without a free-tier marker (negative control).
//    Without this, a pattern set that matched everything would pass step 3.
// ---------------------------------------------------------------------------
console.log("4. Per-locale silence without a free marker (negative control)");
for (const [locale, fx] of Object.entries(FIXTURES)) {
  const body = Object.values(fx.caps).join(". ") + ".\n";
  const { status } = run({ [fixturePath(locale, "neg-nofree")]: body });
  check(`${locale} capability nouns alone do not fire`, status === 0, `exit ${status}`);
}

// ---------------------------------------------------------------------------
// 5. Attributing the capability to the paid tier is legitimate upsell copy.
// ---------------------------------------------------------------------------
console.log("5. Paid attribution suppresses the finding");
for (const [locale, fx] of Object.entries(FIXTURES)) {
  const noun = fx.caps.riskAreas;
  const { status } = run({
    [fixturePath(locale, "neg-paid")]: `${fx.free}. ${fx.paid}: ${noun}.\n`,
  });
  check(`${locale} paid attribution is allowed`, status === 0, `exit ${status}`);
}

// ---------------------------------------------------------------------------
// 6. A free marker on its own is not a finding.
// ---------------------------------------------------------------------------
console.log("6. Free marker alone is not a finding");
for (const [locale, fx] of Object.entries(FIXTURES)) {
  const { status } = run({ [fixturePath(locale, "neg-freeonly")]: `${fx.free}.\n` });
  check(`${locale} free marker alone is clean`, status === 0, `exit ${status}`);
}

// ---------------------------------------------------------------------------
// 7. Coverage of the SHIPPED locale set, read from src/config/i18n.ts.
//
//    Steps 3–6 only exercise the locales listed in FIXTURES above. If someone
//    adds a 17th locale to the site, two things can go wrong and neither shows
//    up as a failure anywhere else:
//      a) the guard has no pattern set → the corpus becomes unverifiable again,
//         which is the whole of ARY-1381 returning;
//      b) the guard has a pattern set but this file has no fixture → the set is
//         never executed, and an inert one (the pl/ru bugs, twice over) reads
//         exactly like a clean corpus.
//    So the locale list is read from the source of truth rather than restated.
// ---------------------------------------------------------------------------
console.log("7. Shipped locale set is fully covered");
{
  const cfg = readFileSync(
    fileURLToPath(new URL("../src/config/i18n.ts", import.meta.url)),
    "utf8",
  );
  const block = /export const LOCALES = \[([\s\S]*?)\] as const;/.exec(cfg);
  check("src/config/i18n.ts LOCALES is parseable", Boolean(block));

  if (block) {
    const shipped = [...block[1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
    // Guards the reader above: a regex that silently matched nothing would make
    // every assertion below vacuously true.
    check("parsed a plausible locale set", shipped.length >= 10, `got ${shipped.length}`);

    // (b) every shipped locale is actually exercised by steps 3–6.
    const missingFixtures = shipped.filter((l) => !(l in FIXTURES));
    check(
      "every shipped locale has a fixture",
      missingFixtures.length === 0,
      `untested pattern sets: ${missingFixtures.join(", ")}`,
    );

    // (a) one file per shipped locale, all at once: zero may be unverifiable.
    const tree = {};
    for (const l of shipped) tree[fixturePath(l, "coverage")] = "Ordinary copy.\n";
    const { status, out } = run(tree);
    check("no shipped locale is unverifiable", status === 0, out.slice(0, 400));
    check(
      `all ${shipped.length} shipped locales evaluated`,
      new RegExp(`${shipped.length} file\\(s\\) evaluated`).test(out),
      out.slice(0, 200),
    );
  }
}

// ---------------------------------------------------------------------------
// 8. No locale's paid marker may fire on its own free marker.
//
//    This is the ru bug as a rule rather than a case: `/платн/` is a substring
//    of `бесплатн`, so every free-tier paragraph read as paid-attributed and
//    the locale went silent — 32 files "evaluated", 0 findings, no way to tell
//    from the outside. Step 3 catches it per capability; this catches it as a
//    class, on the free/paid pair alone, so the diagnosis is one line instead
//    of four failures that all look like missing capability patterns.
// ---------------------------------------------------------------------------
console.log("8. A free marker is never self-suppressing");
for (const [locale, fx] of Object.entries(FIXTURES)) {
  // riskAreas is the shortest capability in every locale, so this is the same
  // shape as step 3 but attributes the failure to the free/paid pair.
  const { status } = run({
    [fixturePath(locale, "selfsuppress")]: `${fx.free}. ${fx.caps.riskAreas}.\n`,
  });
  check(
    `${locale} free marker does not read as paid attribution`,
    status === 1,
    `exit ${status} — a paid marker probably matches inside "${fx.free}"`,
  );
}

console.log(
  `\n${failures === 0 ? "✓" : "✗"} check-tier-claims: ${checks - failures}/${checks} checks passed`,
);
process.exit(failures === 0 ? 0 : 1);
