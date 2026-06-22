/**
 * i18n / hreflang seam (ARY-401).
 *
 * One file owns everything routing-and-locale aware: `<html lang>`, hreflang
 * alternates, the localized sitemap, and localized URL prefixes. Content/layout
 * sub-agents (CMO copy, UXDesigner pages) never touch routing code — they add a
 * locale to a path's entry, drop a translated page file under `src/pages/<loc>/`,
 * and the plumbing below lights up automatically.
 *
 * Phase-1 language set (CMO ARY-399 §3, CEO-approved): English (source) + ES + FR
 * + DE. English ships first; ES/FR/DE are layered as their pages land — see
 * `localesWithPage()` for why a half-translated locale never emits a broken
 * hreflang.
 */

/** Every locale we intend to publish marketing pages in (Phase-1 set). */
export const LOCALES = ['en', 'es', 'fr', 'de'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** Human-readable names (used in the language switcher + sitemap notes). */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
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
  de: 'de',
};

/**
 * Which locales actually have a published page for a given path.
 *
 * This is the single most important multilingual-SEO correctness control (CMO
 * ARY-399 §2e): hreflang and the sitemap must only ever point at pages that
 * exist. Emitting `hreflang="es"` for a `/es/...` URL that 404s is the #1
 * multilingual SEO bug, so until a translation is published we list ONLY the
 * locales whose page is live.
 *
 * `PAGE_LOCALES` overrides per path; anything not listed falls back to
 * English-only. As CMO/UXDesigner publish `src/pages/es/security.astro` etc.,
 * add the locale to that path's entry (or set it to all of `LOCALES` once fully
 * translated). The default English launch therefore emits a clean
 * `en` + `x-default` only — no broken alternates.
 */
const PAGE_LOCALES: Record<string, readonly Locale[]> = {
  // ES Home published (ARY-407, Path A) — lights up the /↔/es/ hreflang pair
  // + sitemap alternate. Trust-critical pages (/security, /privacy) follow once
  // the §5 review budget (ARY-414) is approved; FR/DE per §3 organic demand.
  '/': ['en', 'es'],
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
