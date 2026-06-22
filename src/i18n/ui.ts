/**
 * UI chrome string accessor (ARY-401, ARY-427).
 *
 * Shared chrome (nav, CTAs, footer, language switcher, a11y) is a flat key→string
 * catalog. English is the source of truth (`content/chrome/en.json`); every other
 * locale is a machine translation under `content/chrome/<locale>.json` generated
 * by `scripts/translate.mjs`. Any missing key falls back to English via
 * `getContent`, so a partially-translated locale never ships a blank.
 */
import { DEFAULT_LOCALE, type Locale } from '../config/i18n';
import { getContent } from './content';
import en from './content/chrome/en.json';

/** Key namespace — the English catalog defines the full set of valid keys. */
export type UIKey = keyof typeof en;

/** Returns a `t(key)` accessor for a locale, with English fallback. */
export function useTranslations(locale: Locale = DEFAULT_LOCALE) {
  const dict = getContent<Record<string, string>>('chrome', locale);
  return (key: UIKey): string => dict[key as string] ?? (en as Record<string, string>)[key as string];
}
