/**
 * Home page content catalog (ARY-413).
 *
 * The Home page is the highest-funnel surface, so its long-form copy is made
 * locale-aware here rather than left inline — this is what turns "localize the
 * Home page" into a content-only op: a translator fills the `es`/`fr`/`de`
 * overlay below and `src/pages/<loc>/index.astro` lights up. It mirrors the
 * chrome catalog in `ui.ts`: English is the source of truth, overlays are
 * `DeepPartial<>`, and ANY missing field falls back to English so a
 * half-translated locale never ships a blank string.
 *
 * Scope: visible Home copy only. Shared chrome (nav/CTAs/footer) stays in
 * `ui.ts`; the two CTA labels the hero reuses (`cta.getStarted`, `cta.seeHow`)
 * are pulled from there in `HomePage.astro`, not duplicated here.
 */
import { DEFAULT_LOCALE, type Locale } from '../config/i18n';

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
  trustBand: { heading: string; lead: string; cta: string; proof: string[] };
  finalCta: { title: string; body: string };
}

/** English source — canonical; every field must exist here. */
const en: HomeContent = {
  meta: {
    title: 'A calm, secure home for everything your family owns',
    description:
      'Inventory your assets, keep important documents safe, and see your whole picture — privately, with strong security. Get started free.',
  },
  hero: {
    eyebrow: '🔒 Private & encrypted by design',
    heading: 'One calm, secure place for everything your family owns.',
    sub: "Inventory your assets, keep important documents safe, and see your whole picture — so your family always knows what's there, and what to do next.",
    trust: ['Encrypted in transit & at rest', 'Your data is never sold', 'Built for families'],
    art: {
      cards: [
        { icon: '🏡', label: 'Family home', sub: 'Property · deed & insurance attached' },
        { icon: '📄', label: 'Will & estate documents', sub: '3 files · encrypted vault' },
        { icon: '📈', label: 'Investments & pensions', sub: 'Collection · 5 items' },
      ],
      secured: 'Secured',
      lock: '🔒 Encrypted at rest',
    },
  },
  value: {
    heading: 'Everything in one trusted place',
    sub: 'No spreadsheets. No scattered drawers. Just clarity.',
    cards: [
      {
        icon: '🗂️',
        title: 'Know what you own.',
        body: 'Property, accounts, investments, valuables, pensions — captured in one organised place, not scattered across drawers and spreadsheets.',
      },
      {
        icon: '🛡️',
        title: 'Keep it safe.',
        body: 'Store the documents that matter — deeds, policies, statements — privately, behind strong security.',
      },
      {
        icon: '🧭',
        title: 'Plan with confidence.',
        body: "See the whole picture and get a clear, free overview when you're ready to think about inheritance, wills, or what happens next.",
      },
    ],
  },
  steps: {
    heading: 'Up and running in three steps',
    items: [
      {
        title: 'Add what you own.',
        body: "Snap a photo or upload a document — Vaulto can read it and suggest the details, so you're not typing everything by hand.",
      },
      {
        title: 'Let Vaulto organise it.',
        body: 'Group assets into collections, add the key facts, and keep documents attached where they belong.',
      },
      {
        title: 'See the whole picture.',
        body: "Your family's assets in one view — ready to share with the people who matter and to plan ahead.",
      },
    ],
  },
  trustBand: {
    heading: 'Built to be trusted with your most sensitive information.',
    lead: "Your data is encrypted on the way to us and where it's stored. Access is protected, and we never sell your information.",
    cta: 'See exactly how we keep it safe →',
    proof: [
      'Encrypted in transit (TLS) and at rest',
      "Passwords hashed — even we can't read them",
      'Short-lived, browser-protected sessions',
      'You can only ever see your own vault',
      'We never sell or share your data',
    ],
  },
  finalCta: {
    title: "Start your family's vault today.",
    body: 'Free to begin. No spreadsheets required.',
  },
};

/** Recursive partial: overlays may translate any subtree; arrays replace wholesale. */
type DeepPartial<T> = T extends (infer U)[]
  ? U[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/**
 * Per-locale overlays. Phase-1: ES/FR/DE are empty and inherit English; the
 * translation pack (ARY-407 `phase1-translation-pack`) drops in here. A locale
 * stays English until its overlay is filled — correct for a phased rollout.
 */
const overlays: Record<Locale, DeepPartial<HomeContent>> = {
  en: {},
  es: {},
  fr: {},
  de: {},
};

/** Deep-merge an overlay over English: objects recurse, arrays/primitives replace. */
function merge<T>(base: T, over: DeepPartial<T> | undefined): T {
  if (over === undefined) return base;
  if (Array.isArray(base)) return over as unknown as T;
  if (base !== null && typeof base === 'object') {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const k of Object.keys(over as Record<string, unknown>)) {
      const ov = (over as Record<string, unknown>)[k];
      if (ov === undefined) continue;
      out[k] = merge((base as Record<string, unknown>)[k], ov as DeepPartial<unknown>);
    }
    return out as T;
  }
  return over as unknown as T;
}

/** Localized Home content for a locale, with English fallback per field. */
export function useHomeContent(locale: Locale = DEFAULT_LOCALE): HomeContent {
  return merge(en, overlays[locale]);
}
