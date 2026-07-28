#!/usr/bin/env node
/**
 * check-tier-claims.mjs — ARY-1369
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
 * The rule. Attribution is read at PARAGRAPH scope, because that is how a
 * reader assigns a capability to a tier — the free-tier marker and the
 * over-claimed noun rarely sit in the same sentence (in ARY-1369 they did not).
 * A paragraph fails when it contains a free-tier marker AND a paid-only
 * capability noun, unless that noun is explicitly handed to the paid tier
 * nearby (e.g. "what the detailed report adds: recommended actions").
 *
 * Exit 0 = clean. Exit 1 = at least one unreviewed attribution.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCAN_DIRS = ["src/content", "src/i18n", "src/pages", "src/components"];

/** Copy that tells the reader "this costs nothing". */
const FREE_MARKERS = [
  /\bfree\b/i,
  /\bno card required\b/i,
  /\bwithout paying\b/i,
  /\bat no cost\b/i,
];

/**
 * Paid-only `AdvisoryReport` fields, each with the phrasings marketing copy
 * has actually reached for. Add a synonym here the moment you see one — that
 * is the whole point of this file.
 */
const PAID_CAPABILITIES = [
  {
    field: "riskAreas",
    patterns: [/\brisk areas?\b/i, /\brisks that matter\b/i],
  },
  {
    field: "recommendedActions",
    patterns: [
      /\brecommended actions?\b/i,
      /\bactions? to take\b/i,
      /\bnext steps\b/i,
      /\bsteps worth considering\b/i,
      /\bsteps to take\b/i,
      /\baction plan\b/i,
      /\bwhat to do about (it|them)\b/i,
    ],
  },
  {
    field: "considerations",
    patterns: [/\bkey considerations?\b/i],
  },
  {
    field: "assetBreakdown",
    patterns: [/\basset breakdown\b/i],
  },
  {
    field: "riskProjection",
    patterns: [/\brisk projection\b/i],
  },
];

/**
 * Naming the paid tier within this many characters BEFORE the noun hands the
 * capability to the paid product, which is legitimate upsell copy rather than
 * an over-claim. Kept tight so "free ... [200 chars] ... paid" cannot launder
 * a genuine attribution.
 */
const PAID_ATTRIBUTION_WINDOW = 90;
const PAID_MARKERS = [
  /\bpaid\b/i,
  /\bdetailed report\b/i,
  /\bfull report\b/i,
  /\bupgrade\b/i,
  /\bunlock\b/i,
  /\bgo (deeper|further)\b/i,
  /\bwhen you'?re ready\b/i,
];

/**
 * Reviewed exceptions. Each entry needs an issue id and a reason, so an
 * allowlist cannot quietly become a way to keep an over-claim.
 * Match is a substring of the offending paragraph.
 */
const ALLOWLIST = [
  // (none — keep it that way; fix the copy instead)
];

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

/** True when the noun at `index` is explicitly handed to the paid tier. */
function attributedToPaid(paragraph, index) {
  const before = paragraph.slice(Math.max(0, index - PAID_ATTRIBUTION_WINDOW), index);
  return PAID_MARKERS.some((re) => re.test(before));
}

const findings = [];

for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const text = readFileSync(file, "utf8");
    for (const unit of units(file, text)) {
      if (!FREE_MARKERS.some((re) => re.test(unit.text))) continue;
      if (ALLOWLIST.some((a) => unit.text.includes(a.match))) continue;

      for (const cap of PAID_CAPABILITIES) {
        // Report a capability once per paragraph: several synonyms routinely
        // match the same clause ("recommended actions to take"), and one clause
        // is one defect, not two.
        for (const re of cap.patterns) {
          const match = new RegExp(re.source, re.flags.replace("g", "")).exec(unit.text);
          if (!match) continue;
          if (attributedToPaid(unit.text, match.index)) continue;
          findings.push({
            file: relative(ROOT, file),
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

if (findings.length === 0) {
  console.log("✓ tier-claims: no paid-tier capability attributed to the free tier");
  process.exit(0);
}

console.error(`✗ tier-claims: ${findings.length} free-tier over-claim(s)\n`);
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}`);
  console.error(`    "${f.phrase}" → paid-only AdvisoryReport.${f.field}`);
  console.error(`    ${f.excerpt}\n`);
}
console.error(
  "The free AdvisoryOverview has four sections: what happens today, likely costs\n" +
    "& taxes, gaps in your current protection, and what a detailed report would add.\n" +
    "Describe those, or hand the capability to the paid report explicitly.\n",
);
process.exit(1);
