#!/usr/bin/env node
/**
 * check-tier-claims.mjs — ARY-1369, made locale-aware by ARY-1381
 *
 * Guards one defect class: marketing copy attributing a PAID advisory
 * deliverable to the FREE advisory tier.
 *
 * Why a script and not a grep. ARY-1364 fixed six lines by grepping the string
 * "risk area". A seventh line survived because it said "recommended actions"
 * instead (ARY-1369). A single-string sweep keeps reporting the class clean
 * while a synonym stays live, so this guard greps the CAPABILITY — every known
 * phrasing of a paid-only field — not one phrase.
 *
 * Why locales (ARY-1381). The first version had every pattern in English while
 * scanning a corpus that is 210 files of translated copy, and printed `✓` over
 * all of it. A matcher that cannot match what it is testing for is not evidence
 * of absence — it converts "unverified" into a green check, which is worse than
 * no guard at all. So:
 *   - every scanned file is assigned a locale from its path;
 *   - a locale with no pattern set is reported as UNVERIFIABLE and exits
 *     non-zero (code 2). The guard fails closed; it never passes what it cannot
 *     read. Adding a 17th locale to src/config/i18n.ts now breaks this guard
 *     loudly instead of silently widening the blind spot.
 *
 * Source of truth (read before editing the word lists below):
 *   artifacts/api-server/src/lib/advisoryPipeline.ts in the Asset-Vault repo.
 *   - FREE  `AdvisoryOverview` renders exactly four sections:
 *       whatHappensToday | likelyCostsAndTaxes | gapsInProtection |
 *       whatDetailedReportAdds
 *     plus an `AdvisoryEstimate` (value ranges, line items, costOfInaction,
 *     assumptions).
 *   - PAID  `AdvisoryReport` adds: riskAreas, recommendedActions,
 *     considerations, assetBreakdown, riskProjection.
 *
 * Source of truth for the NON-ENGLISH patterns:
 *   lib/i18n/src/translations.ts in the Asset-Vault repo — the app's reviewed
 *   16-locale catalog. `advisory.riskAreas`, `advisory.considerations`,
 *   `advisory.assetBreakdown`, `advisory.riskProjection`,
 *   `advisory.recommendedNextSteps`, `advisory.yourFreeOverview`,
 *   `advisory.yourDetailedReport` and the `paywall.*` keys are the shipped
 *   wording for these exact capabilities in each language, so the patterns are
 *   the product's own words rather than a machine-translated guess. Marketing
 *   synonyms are additionally taken from this repo's own translated corpus
 *   (src/i18n/content/<ns>/<locale>.json), which is a parallel translation of
 *   the English it sits beside.
 *
 * The rule. Attribution is read at PARAGRAPH scope, because that is how a
 * reader assigns a capability to a tier — the free-tier marker and the
 * over-claimed noun rarely sit in the same sentence (in ARY-1369 they did not).
 * A paragraph fails when it contains a free-tier marker AND a paid-only
 * capability noun, unless that noun is explicitly handed to the paid tier
 * nearby (e.g. "what the detailed report adds: recommended actions").
 *
 * Exit 0 = clean and fully evaluated.
 * Exit 1 = at least one unreviewed attribution.
 * Exit 2 = no attributions found, but part of the corpus could not be evaluated.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// The repo, unless a fixture tree is pointed at it. check-tier-claims.test.mjs
// uses this to run the real guard against controls, which is the only way to
// show that a pattern set fires at all — see ARY-1381: two locales' patterns
// shipped inert in the first draft and the corpus scan reported them clean.
const ROOT = process.env.TIER_CLAIMS_ROOT
  ? resolve(process.env.TIER_CLAIMS_ROOT)
  : fileURLToPath(new URL("..", import.meta.url));
const SCAN_DIRS = ["src/content", "src/i18n", "src/pages", "src/components"];

/**
 * Regex notes for the tables below — the traps that make a translated pattern
 * silently never match:
 *
 * - `\b` in JS is ASCII-only: `\w` is `[A-Za-z0-9_]`. `\bбесплатн` can never
 *   match, because the char before `б` would have to BE a word char. So `\b`
 *   appears ONLY where the adjacent character is an ASCII letter. Cyrillic,
 *   Arabic, Devanagari, Han, Kana and Hangul patterns carry no `\b` at all,
 *   and neither does a Latin pattern that starts with an accent (`ücretsiz`,
 *   `áreas`).
 * - Patterns are STEMS, not whole words, wherever a language inflects:
 *   `\bkostenlos` covers kostenlos / kostenlose / kostenlosen; a trailing `\b`
 *   would defeat that. Precision is bought with a following noun instead
 *   (`obszar\p{L}* ryzyka`).
 * - `\w` is the same ASCII-only trap one level down, and it bites the INFLECTION
 *   rather than the word start: `зон\w* риска` cannot match "Зоны риска" because
 *   `\w*` will not consume "ы", and `krok\w*, które` cannot match "kroków,"
 *   because it will not consume "ó". Every inflectional wildcard is therefore
 *   `\p{L}*` with the `u` flag, never `\w*`. Both of these shipped broken in the
 *   first draft of this table and matched nothing; the fixture run in ARY-1381
 *   is what surfaced it, which is the reason this guard has fixtures.
 * - `i` folds non-ASCII correctly in V8 (`'Ü'.toLowerCase() === 'ü'`), so the
 *   tables are written lower-case throughout, including Turkish.
 */

/** Copy that tells the reader "this costs nothing", per locale. */
const FREE_MARKERS_EN = [
  /\bfree\b/i,
  /\bno card required\b/i,
  /\bwithout paying\b/i,
  /\bat no cost\b/i,
];

/**
 * Naming the paid tier within a short window BEFORE the noun hands the
 * capability to the paid product, which is legitimate upsell copy rather than
 * an over-claim. Kept tight so "free ... [200 chars] ... paid" cannot launder a
 * genuine attribution. RTL copy (ar) is stored in logical order, so "before"
 * means the same thing there as everywhere else. Head-final locales also accept
 * the marker just AFTER the noun — see HEAD_FINAL_LOCALES.
 */
const PAID_MARKERS_EN = [
  /\bpaid\b/i,
  /\bdetailed report/i,
  /\bfull report/i,
  /\bplanning report/i,
  /\bupgrade\b/i,
  /\bunlock/i,
  /\bgo (deeper|further)\b/i,
  /\bwhen you'?re ready\b/i,
];

/**
 * Paid-only `AdvisoryReport` fields, each with the phrasings marketing copy has
 * actually reached for, per locale. Add a synonym here the moment you see one —
 * that is the whole point of this file. English patterns are unioned into every
 * locale, because a translated file that leaves an English phrase untranslated
 * is exactly as much of an over-claim as a translated one.
 */
const CAPABILITIES_EN = {
  riskAreas: [/\brisk areas?\b/i, /\brisks that matter\b/i],
  recommendedActions: [
    /\brecommended actions?\b/i,
    /\bactions? to take\b/i,
    /\bnext steps\b/i,
    /\bsteps worth considering\b/i,
    /\bsteps to take\b/i,
    /\baction plan\b/i,
    /\bwhat to do about (it|them)\b/i,
  ],
  considerations: [/\bkey considerations?\b/i],
  assetBreakdown: [/\basset breakdown\b/i],
  riskProjection: [/\brisk projection\b/i],
};

/** The paid-only field order used in output. */
const CAPABILITY_FIELDS = Object.keys(CAPABILITIES_EN);

/**
 * Per-locale pattern sets. A locale MISSING from this table is not scanned —
 * it is reported as unverifiable and fails the run. That is deliberate.
 */
const LOCALE_PATTERNS = {
  en: { free: [], paid: [], caps: {} },

  es: {
    free: [/\bgratis\b/i, /\bgratuit/i, /\bsin coste\b/i, /\bsin pagar\b/i],
    paid: [
      /informes? (detallado|más avanzado|de planificación)/i,
      /desbloque/i,
      /\bde pago\b/i,
    ],
    caps: {
      riskAreas: [/áreas? de riesgo/i, /zonas? de riesgo/i],
      recommendedActions: [
        /plan de acción/i,
        /próximos pasos/i,
        /pasos? (a seguir|recomendad|que vale la pena)/i,
        /acciones recomendadas/i,
      ],
      considerations: [/aspectos a tener en cuenta/i, /consideraciones clave/i],
      assetBreakdown: [/desglose de (activos|bienes)/i],
      riskProjection: [/proyección de (riesgos?|el riesgo)/i],
    },
  },

  fr: {
    free: [/\bgratuit/i, /\bsans payer\b/i, /\bsans frais\b/i],
    paid: [
      /rapports? (détaillé|plus détaillé|de planification)/i,
      /déblo(quer|qué)/i,
      /\bpayant/i,
    ],
    caps: {
      riskAreas: [/zones? de risque/i, /domaines? de risque/i],
      recommendedActions: [
        /plan d['’]action/i,
        /prochaines étapes/i,
        /étapes? (à envisager|à suivre|recommandée)/i,
        /actions recommandées/i,
      ],
      considerations: [/points à prendre en compte/i, /considérations clés/i],
      assetBreakdown: [/répartition des actifs/i],
      riskProjection: [/projection des risques/i],
    },
  },

  pt: {
    free: [/\bgratuit/i, /\bgrátis/i, /\bsem custo/i],
    paid: [
      /relatórios? (detalhado|mais aprofundado|de plane[aj]amento)/i,
      /desbloque/i,
      /\bpago\b/i,
    ],
    caps: {
      riskAreas: [/áreas? de risco/i],
      recommendedActions: [
        /plano de ação/i,
        /próximos passos/i,
        /passos? (a seguir|recomendad|que vale a pena)/i,
        /ações recomendadas/i,
      ],
      considerations: [/pontos a considerar/i, /considerações principais/i],
      assetBreakdown: [/(detalhamento|repartição) d(os|e) ativos/i],
      riskProjection: [/projeção de riscos?/i],
    },
  },

  de: {
    free: [/\bkostenlos/i, /\bkostenfrei/i, /\bgratis\b/i],
    paid: [
      /(ausführlich|detailliert)\w* bericht/i,
      /\bplanungsbericht/i,
      /\bfreischalt/i,
      /\bkostenpflichtig/i,
    ],
    caps: {
      riskAreas: [/\brisikobereich/i, /\brisikofeld/i],
      recommendedActions: [
        /\baktionsplan/i,
        /\bnächste[nr]? schritte/i,
        /\bempfohlene[nr]? (maßnahmen|schritte|aktionen)/i,
        /\bhandlungsempfehlung/i,
      ],
      considerations: [/\bwichtige überlegungen/i, /\bzu bedenken\b/i],
      assetBreakdown: [/\bvermögensaufschlüsselung/i, /aufschlüsselung des vermögens/i],
      riskProjection: [/\brisikoprognose/i],
    },
  },

  it: {
    free: [/\bgratuit/i, /\bgratis\b/i, /\bsenza costi\b/i],
    paid: [
      /report (dettagliato|più approfondito|di pianificazione)/i,
      /\bsblocc/i,
      /\ba pagamento\b/i,
    ],
    caps: {
      riskAreas: [/are[ae] di rischio/i],
      recommendedActions: [
        /piano d['’]azione/i,
        /prossimi passi/i,
        /passi che vale la pena/i,
        /azioni consigliate/i,
      ],
      considerations: [/considerazioni chiave/i, /aspetti da considerare/i],
      assetBreakdown: [/ripartizione del patrimonio/i],
      riskProjection: [/proiezione del rischio/i],
    },
  },

  nl: {
    free: [/\bgratis\b/i, /\bkosteloos\b/i],
    paid: [
      /(gedetailleerd|uitgebreider)\w* rapport/i,
      /\bplanningsrapport/i,
      /\bontgrendel/i,
      /\bbetaald\b/i,
    ],
    caps: {
      riskAreas: [/\brisicogebied/i],
      recommendedActions: [
        /\bactieplan/i,
        /volgende stappen/i,
        /aanbevolen (acties|stappen)/i,
      ],
      considerations: [/belangrijke overwegingen/i],
      assetBreakdown: [/uitsplitsing van (bezittingen|vermogen)/i],
      riskProjection: [/\brisicoprognose/i],
    },
  },

  sv: {
    free: [/\bgratis\b/i, /\bkostnadsfri/i, /\butan kostnad\b/i],
    paid: [
      /(detaljerad|djupgående)\w* rapport/i,
      /\bplaneringsrapport/i,
      /lås upp/i,
      /\bbetald\b/i,
    ],
    caps: {
      riskAreas: [/\briskområde/i],
      recommendedActions: [
        /\bhandlingsplan/i,
        /nästa steg/i,
        /steg som .{0,24}värda/i,
        /rekommenderade (åtgärder|steg)/i,
      ],
      considerations: [/viktigt att tänka på/i, /viktiga överväganden/i],
      assetBreakdown: [/\btillgångsfördelning/i],
      riskProjection: [/\briskprognos/i],
    },
  },

  pl: {
    free: [/\bbezpłatn/i, /\bdarmow/i, /\bza darmo\b/i],
    paid: [
      /(szczegółow|pogłębion|planistyczn)\p{L}* raport/iu,
      /raport\p{L}* (szczegółow|planistyczn)/iu,
      /\bodblokuj/i,
      /\bpłatn/i,
    ],
    caps: {
      riskAreas: [/obszar\p{L}* ryzyka/iu],
      recommendedActions: [
        /plan\p{L}* działania/iu,
        /(kolejne|następne|dalsze) kroki/i,
        /krok\p{L}*,? które warto/iu,
        /zalecane (działania|kroki)/i,
      ],
      considerations: [/kluczowe (uwagi|kwestie)/i],
      assetBreakdown: [/podział aktywów/i],
      riskProjection: [/prognoza ryzyka/i],
    },
  },

  tr: {
    free: [/ücretsiz/i, /\bbedava\b/i],
    paid: [
      /(ayrıntılı|kapsamlı) rapor/i,
      /planlama raporu/i,
      /kilidini aç/i,
      /ücretli/i,
    ],
    caps: {
      riskAreas: [/risk alan/i],
      recommendedActions: [
        /eylem planı/i,
        /sonraki adımlar/i,
        /değer adımlar/i,
        /önerilen (adımlar|eylemler)/i,
      ],
      considerations: [/dikkat edilmesi gerekenler/i],
      assetBreakdown: [/varlık dökümü/i],
      riskProjection: [/risk öngörüsü/i],
    },
  },

  ru: {
    free: [/бесплатн/i],
    // "ё" is routinely typed as "е" in Russian copy, so every stem carrying one
    // accepts both spellings — a guard that only knows "отчёт" is blind to
    // "отчет", which is the same silent pass one alphabet down.
    paid: [
      /(подробн|детальн)\p{L}* отч[её]т/iu,
      /отч[её]т\p{L}* по планированию/iu,
      /разблокир/i,
      // "бесплатный" CONTAINS "платн", so a bare /платн/ marks every free-tier
      // sentence as paid-attributed and silences the whole locale — ru scored
      // 32 files evaluated, 0 findings that way. `\b` cannot rescue this the way
      // it does pl's `\bpłatn` vs "bezpłatny", because `\b` is ASCII-only and
      // never fires between two Cyrillic letters. Assertion 7 in the test file
      // now checks this class across every locale.
      /(?<!бес)платн/i,
    ],
    caps: {
      riskAreas: [/зон\p{L}* риска/iu, /област\p{L}* риска/iu],
      recommendedActions: [
        /план действий/i,
        /следующи\p{L}+ шаг/iu,
        /шаг\p{L}*, которые стоит/iu,
        /рекомендуем\p{L}+ (действия|шаги)/iu,
      ],
      considerations: [/что учесть/i, /ключевые соображения/i],
      assetBreakdown: [/разбивка активов/i],
      riskProjection: [/прогноз рисков/i],
    },
  },

  ar: {
    free: [/مجان/],
    // Arabic attaches the article and the possessive to the word, so the
    // shipped heading is "تقريرك المفصّل" — a literal "تقرير مفصّل" matches none
    // of the forms it has to. Stems plus `\p{L}*` on both sides of the space
    // cover تقرير/تقارير/تقريرك and مفصّل/المفصّل/مفصّلة; the shadda is optional
    // because both spellings are live, the same way hi carries the nukta split.
    paid: [
      /(تقرير|تقارير)\p{L}*\s+\p{L}*مفصّ?ل/u,
      /(تقرير|تقارير)\p{L}*\s+\p{L}*تخطيط/u,
      /مدفوع/,
    ],
    caps: {
      riskAreas: [/مجالات الخطر/, /مجالات المخاطر/],
      recommendedActions: [
        /خطة عمل/,
        /الخطوات التي/,
        /الخطوات الموصى/,
        /الإجراءات الموصى/,
      ],
      considerations: [/اعتبارات رئيسية/],
      assetBreakdown: [/تفصيل الأصول/],
      riskProjection: [/توقعات المخاطر/],
    },
  },

  hi: {
    // "मुफ़्त" (with nukta, app catalog) and "मुफ्त" (without, this repo's corpus)
    // are both live spellings; missing one is a silent pass.
    free: [/मुफ़्त/, /मुफ्त/, /निःशुल्क/],
    paid: [/विस्तृत रिपोर्ट/, /गहरी योजना रिपोर्ट/, /अनलॉक/, /सशुल्क/],
    caps: {
      riskAreas: [/जोखिम वाले क्षेत्र/, /जोखिम क्षेत्र/],
      recommendedActions: [
        /कार्य योजना/,
        /कदमों पर विचार/,
        /अगले कदम/,
        /अनुशंसित (कदम|कार्रवाई)/,
      ],
      considerations: [/विचारणीय बातें/],
      assetBreakdown: [/संपत्ति का विवरण/],
      riskProjection: [/जोखिम अनुमान/],
    },
  },

  zh: {
    free: [/免费/, /免費/],
    paid: [/详细报告/, /規劃報告/, /规划报告/, /解锁/, /付费/],
    caps: {
      riskAreas: [/风险领域/],
      recommendedActions: [/行动计划/, /下一步/, /值得考虑的步骤/, /建议采取的行动/],
      considerations: [/注意事项/],
      assetBreakdown: [/资产明细/],
      riskProjection: [/风险预测/],
    },
  },

  ja: {
    free: [/無料/],
    paid: [/詳細レポート/, /計画レポート/, /アンロック/, /有料/],
    caps: {
      riskAreas: [/リスク領域/],
      recommendedActions: [
        /アクションプラン/,
        /次のステップ/,
        /検討する価値のある手順/,
        /推奨される(行動|措置)/,
      ],
      considerations: [/考慮すべき点/],
      assetBreakdown: [/資産の内訳/],
      riskProjection: [/リスク予測/],
    },
  },

  ko: {
    free: [/무료/],
    paid: [/상세 보고서/, /계획 보고서/, /잠금 해제/, /유료/],
    caps: {
      riskAreas: [/위험 영역/],
      recommendedActions: [/실행 계획/, /다음 단계/, /고려할 만한 단계/, /권장 조치/],
      considerations: [/고려 사항/],
      assetBreakdown: [/자산 상세 내역/],
      riskProjection: [/위험 예측/],
    },
  },
};

/**
 * Han/Kana/Hangul pack far more meaning into a character, so the same character
 * count spans several sentences. Attribution has to stay in the same breath, so
 * dense scripts get a proportionally shorter window.
 */
const ATTRIBUTION_WINDOW = { zh: 40, ja: 40, ko: 40 };
const ATTRIBUTION_WINDOW_DEFAULT = 90;

/**
 * Head-final locales (ARY-1513).
 *
 * A before-only window encodes a Latin/analytic word order: "go further with a
 * full report — including the steps worth considering." Japanese, Korean and
 * Turkish put the relative clause BEFORE the head noun, so a grammatical
 * attribution necessarily puts the report AFTER the capability:
 *
 *   ja 次に検討する価値のある手順を含む詳細レポートへ進みます。
 *      └─ capability ─────────────┘   └ 詳細レポート ┘
 *
 * `詳細レポート` is the shipped `advisory.yourDetailedReport` string and the
 * attribution is unambiguous to a reader, but a before-only window scores it as
 * a free-tier over-claim. The only ways to satisfy that matcher in these
 * languages are to mangle grammatical Japanese/Korean/Turkish or to allowlist
 * them, so the window is what gets fixed, not the copy.
 *
 * Scoped to these three locales on purpose: everywhere else "free … [gap] …
 * paid" must keep failing, because in a head-initial language a paid noun that
 * trails the capability is a later, separate statement rather than the head the
 * capability was modifying.
 *
 * `zh` is deliberately NOT here. It is head-final for relative clauses too, but
 * its shipped copy does not use that construction and every zh finding to date
 * has been a genuine over-claim; the window widens when a locale needs it, with
 * a fixture, not pre-emptively.
 */
const HEAD_FINAL_LOCALES = new Set(["ja", "ko", "tr"]);

/**
 * The after-window never crosses a sentence boundary.
 *
 * Head-final attribution is a modifier and its head inside ONE clause, so the
 * paid noun is always in the same sentence as the capability. Stopping there is
 * what keeps the widened window from laundering the real defect — "the free
 * overview shows the steps worth considering. Separately, the detailed report
 * …" still fails, in ja/ko/tr as everywhere else.
 *
 * `[.!?]` only counts as a terminator before whitespace or end-of-string, so a
 * Turkish ordinal ("3. adım") or a decimal does not truncate the window; CJK
 * `。！？` need no such guard because they are not used mid-token.
 */
const SENTENCE_END = /[。．！？\n]|[.!?](\s|$)/u;

/**
 * Reviewed exceptions. Each entry needs an issue id and a reason, so an
 * allowlist cannot quietly become a way to keep an over-claim.
 * Match is a substring of the offending paragraph.
 */
const ALLOWLIST = [
  // (none — keep it that way; fix the copy instead)
];

/**
 * Which locale a file's copy is written in.
 *
 * `src/pages/[locale]/…` is a dynamic Astro route, not a locale directory — the
 * literal segment is "[locale]" and any hard-coded copy in it is English, so it
 * falls through to the default like the rest of the source tree.
 */
function localeOf(rel) {
  const p = rel.split(sep).join("/");
  let m = /^src\/content\/blog-i18n\/([a-z]{2}(?:-[a-z]+)?)\//i.exec(p);
  if (m) return m[1].toLowerCase();
  m = /^src\/i18n\/content\/[^/]+\/([a-z]{2}(?:-[a-z]+)?)\.json$/i.exec(p);
  if (m) return m[1].toLowerCase();
  return "en";
}

function patternsFor(locale) {
  const set = LOCALE_PATTERNS[locale];
  if (!set) return null;
  return {
    free: [...FREE_MARKERS_EN, ...set.free],
    paid: [...PAID_MARKERS_EN, ...set.paid],
    caps: CAPABILITY_FIELDS.map((field) => ({
      field,
      patterns: [...CAPABILITIES_EN[field], ...(set.caps[field] ?? [])],
    })),
    window: ATTRIBUTION_WINDOW[locale] ?? ATTRIBUTION_WINDOW_DEFAULT,
    headFinal: HEAD_FINAL_LOCALES.has(locale),
  };
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(md|mdx|json|astro|tsx?)$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Split a file into attribution units. Markdown splits on blank lines; JSON
 * copy files are split per string value, since each value is rendered on its
 * own and carries its own attribution.
 */
function units(file, text) {
  if (file.endsWith(".json")) {
    const found = [];
    const re = /"(?:[^"\\]|\\.)*"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    let m;
    while ((m = re.exec(text))) {
      const value = m[1].replace(/\\"/g, '"').replace(/\\n/g, " ");
      found.push({ text: value, offset: m.index });
    }
    return found;
  }
  const found = [];
  let offset = 0;
  for (const block of text.split(/\n\s*\n/)) {
    found.push({ text: block, offset });
    offset += block.length + 2;
  }
  return found;
}

function lineOf(text, offset) {
  return text.slice(0, offset).split("\n").length;
}

/** The run of text up to the first sentence terminator, if there is one. */
function firstSentence(text) {
  const m = SENTENCE_END.exec(text);
  return m ? text.slice(0, m.index) : text;
}

/**
 * True when the capability spanning [start, end) is explicitly handed to the
 * paid tier.
 *
 * Everywhere: a paid marker within `window` chars BEFORE it. RTL copy (ar) is
 * stored in logical order, so "before" means the same thing there.
 * Head-final locales additionally: a paid marker within `window` chars AFTER
 * it, in the same sentence — see HEAD_FINAL_LOCALES.
 */
function attributedToPaid(paragraph, start, end, paidMarkers, window, headFinal) {
  const before = paragraph.slice(Math.max(0, start - window), start);
  if (paidMarkers.some((re) => re.test(before))) return true;
  if (!headFinal) return false;
  const after = firstSentence(paragraph.slice(end, end + window));
  return paidMarkers.some((re) => re.test(after));
}

const findings = [];
const unverifiable = new Map(); // locale -> string[] of relative paths
const scanned = new Map(); // locale -> file count

for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file);
    const locale = localeOf(rel);
    const set = patternsFor(locale);

    if (!set) {
      if (!unverifiable.has(locale)) unverifiable.set(locale, []);
      unverifiable.get(locale).push(rel);
      continue;
    }
    scanned.set(locale, (scanned.get(locale) ?? 0) + 1);

    const text = readFileSync(file, "utf8");
    for (const unit of units(file, text)) {
      if (!set.free.some((re) => re.test(unit.text))) continue;
      if (ALLOWLIST.some((a) => unit.text.includes(a.match))) continue;

      for (const cap of set.caps) {
        // Report a capability once per paragraph: several synonyms routinely
        // match the same clause ("recommended actions to take"), and one clause
        // is one defect, not two.
        for (const re of cap.patterns) {
          const match = new RegExp(re.source, re.flags.replace("g", "")).exec(unit.text);
          if (!match) continue;
          const end = match.index + match[0].length;
          if (
            attributedToPaid(unit.text, match.index, end, set.paid, set.window, set.headFinal)
          ) {
            continue;
          }
          findings.push({
            file: rel,
            locale,
            line: lineOf(text, unit.offset),
            field: cap.field,
            phrase: match[0],
            excerpt: unit.text.trim().replace(/\s+/g, " ").slice(0, 220),
          });
          break;
        }
      }
    }
  }
}

// Coverage is printed on every run, pass or fail. A guard that reports what it
// could not read is the only kind whose green means anything.
const totalScanned = [...scanned.values()].reduce((a, b) => a + b, 0);
const totalUnverifiable = [...unverifiable.values()].reduce((a, b) => a + b.length, 0);
console.log(
  `tier-claims coverage: ${totalScanned} file(s) evaluated across ` +
    `${scanned.size} locale(s) [${[...scanned.keys()].sort().join(" ")}] · ` +
    `${totalUnverifiable} unverifiable`,
);

if (totalUnverifiable > 0) {
  console.error(
    `\n✗ tier-claims: ${totalUnverifiable} file(s) in ${unverifiable.size} locale(s) ` +
      `have NO pattern set and were NOT evaluated\n`,
  );
  for (const [locale, files] of [...unverifiable].sort()) {
    console.error(`  ${locale}: ${files.length} file(s), e.g. ${files[0]}`);
  }
  console.error(
    "\nAdd a LOCALE_PATTERNS entry for each locale above. Source the wording from\n" +
      "lib/i18n/src/translations.ts in the Asset-Vault repo (advisory.riskAreas,\n" +
      "advisory.recommendedNextSteps, advisory.considerations, advisory.assetBreakdown,\n" +
      "advisory.riskProjection, advisory.yourFreeOverview, advisory.yourDetailedReport)\n" +
      "— the shipped, reviewed translation of these exact capabilities. Do not guess.\n",
  );
}

if (findings.length === 0) {
  if (totalUnverifiable === 0) {
    console.log("✓ tier-claims: no paid-tier capability attributed to the free tier");
    process.exit(0);
  }
  process.exit(2);
}

console.error(`\n✗ tier-claims: ${findings.length} free-tier over-claim(s)\n`);
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}  [${f.locale}]`);
  console.error(`    "${f.phrase}" → paid-only AdvisoryReport.${f.field}`);
  console.error(`    ${f.excerpt}\n`);
}
console.error(
  "The free AdvisoryOverview has four sections: what happens today, likely costs\n" +
    "& taxes, gaps in your current protection, and what a detailed report would add.\n" +
    "Describe those, or hand the capability to the paid report explicitly.\n",
);
process.exit(1);
