/**
 * i18n / hreflang seam (ARY-401).
 *
 * Single-locale today (`en`), but every place that needs to know about locales
 * — `<html lang>`, hreflang alternates, the localized sitemap, and (later)
 * localized URL prefixes — reads from this one file. Adding a language is a
 * one-line change to LOCALES + its HREFLANG entry; the content sub-agents never
 * touch routing code.
 */
export const LOCALES = ['en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/** Maps our internal locale codes → BCP-47 hreflang values. */
export const HREFLANG: Record<Locale, string> = { en: 'en' };

/**
 * hreflang alternates for a given path. Today this is the default locale plus
 * `x-default`; when LOCALES grows, localized URL prefixes are produced here
 * (e.g. `/es/blog/`) without changing any page.
 */
export function alternatesFor(path: string, base: string) {
  const alts = LOCALES.map((loc) => ({
    hreflang: HREFLANG[loc],
    href: new URL(loc === DEFAULT_LOCALE ? path : `/${loc}${path}`, base).href,
  }));
  alts.push({ hreflang: 'x-default', href: new URL(path, base).href });
  return alts;
}
