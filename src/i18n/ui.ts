/**
 * UI string catalog — the translation pipeline (ARY-401 #2).
 *
 * This is the mechanism CMO's translations drop into. English is the source of
 * truth; ES/FR/DE are layered as `Partial<>` overlays and ANY missing key falls
 * back to English, so a partially-translated locale never ships a blank string
 * (it shows English until translated — correct behaviour for a phased rollout).
 *
 * Scope: shared chrome (nav, CTAs, footer, language switcher) that every page
 * reuses. Long-form page prose is localized per locale-prefixed page file (see
 * I18N.md) rather than crammed into this map. Add a key here, translate it in
 * each locale overlay, and `t('key')` returns the right string everywhere.
 */
import { DEFAULT_LOCALE, type Locale } from '../config/i18n';

/** English source strings — the canonical set; every key must exist here. */
const en = {
  'nav.home': 'Home',
  'nav.howItWorks': 'How it works',
  'nav.features': 'Features',
  'nav.planning': 'Planning',
  'nav.security': 'Security',
  'nav.faq': 'FAQ',
  'nav.blog': 'Blog',
  'cta.getStarted': 'Get started free',
  'cta.seeHow': 'See how it works',
  'cta.startVault': 'Start your vault — free',
  'cta.explorePlanning': 'Explore planning',
  'footer.tagline': 'One calm, secure place for everything your family owns.',
  'footer.security': 'Security & Privacy',
  'footer.privacy': 'Privacy',
  'footer.rights': 'All rights reserved.',
  'footer.signIn': 'Sign in →',
  'lang.switch': 'Language',
  'trust.strip': 'Encrypted in transit (TLS) and at rest · Your data is never sold · Built for families',
} as const;

/** Key namespace — guarantees overlays can only translate real keys. */
export type UIKey = keyof typeof en;

/**
 * Per-locale overlays. Phase-1: ES/FR/DE are empty and inherit English; CMO
 * fills these in as translations land (ARY-399 §3 sequencing). Typed as
 * `Partial` so a half-finished locale type-checks and falls back gracefully.
 */
const overlays: Record<Locale, Partial<Record<UIKey, string>>> = {
  en: {},
  // ES chrome (ARY-407, Path A / $0 — CEO-approved 2026-06-22). `trust.strip` is
  // intentionally left to English fallback: it carries the "encrypted … at rest"
  // claim under reconciliation in ARY-419; it gets translated once the corrected
  // English source lands, alongside the Home trust-band strings.
  es: {
    'nav.home': 'Inicio',
    'nav.howItWorks': 'Cómo funciona',
    'nav.features': 'Funciones',
    'nav.planning': 'Planificación',
    'nav.security': 'Seguridad',
    'nav.faq': 'Preguntas frecuentes',
    'nav.blog': 'Blog',
    'cta.getStarted': 'Empieza gratis',
    'cta.seeHow': 'Ver cómo funciona',
    'cta.startVault': 'Crea tu bóveda — gratis',
    'cta.explorePlanning': 'Explora la planificación',
    'footer.tagline': 'Un lugar tranquilo y seguro para todo lo que tu familia posee.',
    'footer.security': 'Seguridad y privacidad',
    'footer.privacy': 'Privacidad',
    'footer.rights': 'Todos los derechos reservados.',
    'footer.signIn': 'Iniciar sesión →',
    'lang.switch': 'Idioma',
  },
  fr: {},
  de: {},
};

/** Returns a `t(key)` accessor for a locale, with English fallback. */
export function useTranslations(locale: Locale = DEFAULT_LOCALE) {
  const overlay = overlays[locale] ?? {};
  return (key: UIKey): string => overlay[key] ?? en[key];
}

/** Build/CI helper: keys missing from a locale overlay (i.e. still English). */
export function untranslatedKeys(locale: Locale): UIKey[] {
  if (locale === DEFAULT_LOCALE) return [];
  const overlay = overlays[locale] ?? {};
  return (Object.keys(en) as UIKey[]).filter((k) => !(k in overlay));
}
