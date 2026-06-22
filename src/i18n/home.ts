/**
 * Home page content (ARY-413, migrated to JSON catalog in ARY-427).
 *
 * The Home copy now lives in `content/home/<locale>.json` like every other page,
 * so it shares the one OpenAI translate script and the `getContent` fallback.
 * This module keeps the `HomeContent` type (so `HomePage.astro` stays strongly
 * typed) and a thin `useHomeContent` accessor. English is canonical; any missing
 * field in a translated locale falls back to English.
 */
import { DEFAULT_LOCALE, type Locale } from '../config/i18n';
import { getContent } from './content';

export interface HomeContent {
  meta: { title: string; description: string };
  hero: {
    eyebrow: string;
    heading: string;
    sub: string;
    trust: string[];
    /** Decorative vault preview cards (label + sublabel) + status pills. */
    art: {
      cards: { icon: string; label: string; sub: string }[];
      secured: string;
      lock: string;
    };
  };
  value: {
    heading: string;
    sub: string;
    cards: { icon: string; title: string; body: string }[];
  };
  steps: {
    heading: string;
    items: { title: string; body: string }[];
  };
  trustBand: {
    heading: string;
    lead: string;
    cta: string;
    proof: string[];
  };
  finalCta: { title: string; body: string };
}

/** Localized Home content for a locale, with English fallback per field. */
export function useHomeContent(locale: Locale = DEFAULT_LOCALE): HomeContent {
  return getContent<HomeContent>('home', locale);
}
