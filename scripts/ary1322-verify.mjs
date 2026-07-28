#!/usr/bin/env node
// ARY-1322 verification for the /security re-cut.
//   NEGATIVE control — the superseded segment of each clause (derived
//     automatically by diffing against bcf5f8b, so no hand-typed rendering can
//     be missed) must be gone, 0/16. Plus a hand-listed "searched" token per
//     locale, since that claim was introduced after bcf5f8b.
//   POSITIVE control — each locale must carry the corrected scope: the
//     app-layer seal naming exact valuations, and the readable-fields clause
//     naming purchase price behind an open-set marker.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const LOCALES = "en ar de es fr hi it ja ko nl pl pt ru sv tr zh".split(" ");
const BASE = "bcf5f8b";

// [searched-claim token (must be absent), open-set marker, purchase-price term,
//  exact-valuations term] — all must be present except the first.
const TOKENS = {
  en: ["and searched", "things like", "purchase price", "exact valuations"],
  ar: ["والبحث فيها", "أمور مثل", "سعر الشراء", "التقييمات الدقيقة"],
  de: ["durchsucht", "etwa Kategorie", "Kaufpreis", "die genauen Werte"],
  es: ["buscándose", "cosas como", "precio de compra", "las valoraciones exactas"],
  fr: ["et recherché", "des éléments comme", "prix d'achat", "les valeurs exactes"],
  hi: ["खोजा जा सके", "जैसे वर्ग", "ख़रीद मूल्य", "सटीक मूल्यांकन"],
  it: ["e cercata", "cose come", "prezzo d'acquisto", "le valutazioni esatte"],
  ja: ["検索ができる", "たとえばカテゴリ", "購入価格", "正確な評価額"],
  ko: ["합산하고 검색할", "예를 들어 카테고리", "구매 가격", "정확한 평가액"],
  nl: ["doorzocht", "dingen als", "aankoopprijs", "de exacte waarderingen"],
  pl: ["przeszukiwać", "rzeczy takie jak", "cena zakupu", "dokładne wyceny"],
  pt: ["e pesquisado", "coisas como", "preço de compra", "as avaliações exatas"],
  ru: ["искать по нему", "такие вещи, как", "цена покупки", "точные оценки стоимости"],
  sv: ["sökas igenom", "sådant som", "inköpspris", "de exakta värderingarna"],
  tr: ["ve aranabilir", "gibi şeyler", "satın alma fiyatı", "tam değerlemeler"],
  zh: ["和搜索", "诸如类别", "购买价格", "精确估值"],
};

/** The part of `before` that `after` replaced — trims the shared head/tail. */
function supersededSegment(before, after) {
  let head = 0;
  while (head < before.length && before[head] === after[head]) head++;
  let tail = 0;
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) tail++;
  return before.slice(head, before.length - tail);
}

let fails = 0;
const rows = [];
for (const loc of LOCALES) {
  const rel = `src/i18n/content/security/${loc}.json`;
  const now = JSON.parse(readFileSync(rel, "utf8"));
  const was = JSON.parse(
    execFileSync("git", ["show", `${BASE}:${rel}`], { encoding: "utf8" }),
  );
  const [searched, openSet, price, valuations] = TOKENS[loc];
  const checks = [];

  for (const [label, nowText, wasText] of [
    ["honesty", now.honesty.body, was.honesty.body],
    ["protections[1]", now.protections[1].body, was.protections[1].body],
  ]) {
    const gone = supersededSegment(wasText, nowText);
    if (gone.length < 20) {
      checks.push(`${label}:NOT-RECUT`);
    } else if (nowText.includes(gone)) {
      checks.push(`${label}:STALE-PRESENT`);
    } else {
      checks.push(`${label}:recut(-${gone.length}ch)`);
    }
  }
  checks.push(now.honesty.body.includes(searched) ? "searched:PRESENT" : "searched:0");
  checks.push(now.honesty.body.includes(openSet) ? "open-set:ok" : "open-set:MISSING");
  checks.push(now.honesty.body.includes(price) ? "price:ok" : "price:MISSING");
  checks.push(
    now.protections[1].body.includes(valuations) ? "valuations:ok" : "valuations:MISSING",
  );

  const bad = checks.some((c) => /[A-Z]{2,}/.test(c));
  if (bad) fails++;
  rows.push(`${bad ? "FAIL" : "PASS"} ${loc}  ${checks.join("  ")}`);
}
console.log(rows.join("\n"));
console.log(`\n${LOCALES.length - fails}/${LOCALES.length} locales pass.`);
process.exit(fails ? 1 : 0);
