/**
 * i18n / hreflang seam (ARY-401, expanded ARY-427).
 *
 * One file owns everything routing-and-locale aware: `<html lang>`, text
 * direction, hreflang alternates, the localized sitemap, and localized URL
 * prefixes. Content sub-systems never touch routing code — they add a locale to
 * a path's entry, the translated strings exist as JSON overlays, and the
 * plumbing below lights up automatically.
 *
 * Language set (ARY-427, board directive ARY-425): the FULL set of locales the
 * Vaulto app supports — enumerated from the app's i18n catalog
 * (`lib/i18n/src/translations.ts`, the 16-locale set). Marketing translations
 * are machine-generated via the OpenAI API at $0 (see `scripts/translate.mjs`)
 * with English as the canonical source + per-string fallback.
 */

/** Every locale we publish marketing pages in — mirrors the app's supported set. */
export const LOCALES = [
  'en', 'es', 'fr', 'pt', 'de', 'it', 'nl', 'zh',
  'ja', 'ar', 'hi', 'ru', 'pl', 'tr', 'ko', 'sv',
] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** Human-readable native names (language switcher + sitemap notes). */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  pt: 'Português',
  de: 'Deutsch',
  it: 'Italiano',
  nl: 'Nederlands',
  zh: '中文',
  ja: '日本語',
  ar: 'العربية',
  hi: 'हिन्दी',
  ru: 'Русский',
  pl: 'Polski',
  tr: 'Türkçe',
  ko: '한국어',
  sv: 'Svenska',
};

/**
 * Maps our internal locale codes → BCP-47 hreflang values. Kept explicit (rather
 * than reusing the code 1:1) so a future regionalised locale (e.g. `pt-BR`) is a
 * one-line change without renaming routes.
 */
export const HREFLANG: Record<Locale, string> = {
  en: 'en',
  es: 'es',
  fr: 'fr',
  pt: 'pt',
  de: 'de',
  it: 'it',
  nl: 'nl',
  zh: 'zh',
  ja: 'ja',
  ar: 'ar',
  hi: 'hi',
  ru: 'ru',
  pl: 'pl',
  tr: 'tr',
  ko: 'ko',
  sv: 'sv',
};

/** Locales whose script reads right-to-left (drives `<html dir>`). */
export const RTL_LOCALES = new Set<Locale>(['ar']);

/** Text direction for a locale — `rtl` for Arabic, `ltr` otherwise. */
export function dirFor(locale: Locale): 'ltr' | 'rtl' {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}

/** All non-default locales — the set the dynamic `[locale]/` routes enumerate. */
export const NON_DEFAULT_LOCALES = LOCALES.filter((l) => l !== DEFAULT_LOCALE);

/**
 * Which locales actually have a published page for a given path.
 *
 * This is the single most important multilingual-SEO correctness control (CMO
 * ARY-399 §2e): hreflang and the sitemap must only ever point at pages that
 * exist. Emitting `hreflang="es"` for a `/es/...` URL that 404s is the #1
 * multilingual SEO bug.
 *
 * ARY-427: every Phase-1 page is now machine-translated into the full locale
 * set, so each path lists ALL locales. `PAGE_LOCALES` still overrides per path,
 * so a future English-only page can opt out by omitting it (falls back to
 * English-only). Translated strings always carry an English fallback, so no
 * locale ever ships a blank.
 */
const ALL: readonly Locale[] = LOCALES;
const PAGE_LOCALES: Record<string, readonly Locale[]> = {
  '/': ALL,
  '/how-it-works/': ALL,
  '/features/': ALL,
  '/planning/': ALL,
  '/security/': ALL,
  '/privacy/': ALL,
  '/faq/': ALL,
};

/** Normalises a path to the form used as a PAGE_LOCALES key (leading+trailing /). */
function normalize(path: string): string {
  let p = path.startsWith('/') ? path : `/${path}`;
  if (!p.endsWith('/')) p = `${p}/`;
  return p;
}

/** The locales that have a live page for `path` (always includes the default). */
export function localesWithPage(path: string): readonly Locale[] {
  const declared = PAGE_LOCALES[normalize(path)] ?? [DEFAULT_LOCALE];
  return declared.includes(DEFAULT_LOCALE) ? declared : [DEFAULT_LOCALE, ...declared];
}

/** Localized URL for a path in a given locale (default locale is un-prefixed). */
export function localizedPath(path: string, locale: Locale): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return locale === DEFAULT_LOCALE ? clean : `/${locale}${clean}`;
}

/**
 * hreflang alternates for a path — ONLY for locales whose page is live, plus the
 * `x-default` that search engines fall back to. Returns absolute URLs.
 */
export function alternatesFor(path: string, base: string) {
  const live = localesWithPage(path);
  const alts = live.map((loc) => ({
    hreflang: HREFLANG[loc],
    href: new URL(localizedPath(path, loc), base).href,
  }));
  alts.push({ hreflang: 'x-default', href: new URL(path, base).href });
  return alts;
}
