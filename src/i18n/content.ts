/**
 * Generic localized-content loader (ARY-427).
 *
 * Every translatable surface — shared chrome and each marketing page body —
 * lives as a JSON catalog under `src/i18n/content/<group>/<locale>.json`.
 * English (`en.json`) is the canonical source of truth, authored by hand; every
 * other locale is a machine translation generated at $0 by `scripts/translate.mjs`
 * via the OpenAI API. This module deep-merges a locale's overlay over English so
 * ANY missing or blank string falls back to English — a partially-translated
 * locale never ships a hole.
 *
 * Adding a locale is therefore content-only: the script writes the JSON, the
 * locale is listed in `config/i18n.ts`, and routing/hreflang/sitemap derive
 * automatically.
 */
import { DEFAULT_LOCALE, type Locale } from '../config/i18n';

// Eagerly bundle every content JSON at build time. Keys are paths like
// './content/security/en.json'.
const modules = import.meta.glob('./content/*/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

type Dict = Record<string, unknown>;

/**
 * Deep-merge a translated overlay over the English base.
 * - Objects recurse key-by-key.
 * - Arrays merge element-wise (so a short/partial translated array still falls
 *   back per-element to English — never drops items).
 * - A blank/whitespace-only translated string falls back to English.
 */
function deepMerge<T>(base: T, over: unknown): T {
  if (over === undefined || over === null) return base;
  if (Array.isArray(base)) {
    if (!Array.isArray(over)) return base;
    return base.map((el, i) => deepMerge(el, (over as unknown[])[i])) as unknown as T;
  }
  if (base !== null && typeof base === 'object') {
    const out: Dict = { ...(base as Dict) };
    const ovr = over as Dict;
    for (const k of Object.keys(ovr)) {
      if (ovr[k] === undefined) continue;
      out[k] = deepMerge((base as Dict)[k], ovr[k]);
    }
    return out as T;
  }
  if (typeof over === 'string' && over.trim() === '') return base;
  return over as T;
}

/** Localized content for a group, with per-field English fallback. */
export function getContent<T = unknown>(group: string, locale: Locale = DEFAULT_LOCALE): T {
  const en = modules[`./content/${group}/en.json`] as T | undefined;
  if (en === undefined) throw new Error(`i18n: no English source for content group "${group}"`);
  if (locale === DEFAULT_LOCALE) return en;
  const overlay = modules[`./content/${group}/${locale}.json`];
  return deepMerge(en, overlay);
}
