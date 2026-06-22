/**
 * schema.org JSON-LD builders (CMO ARY-399 §2d spec).
 *
 * Seo.astro composes a single `@graph` from these so every page ships correct,
 * de-duplicated structured data. Pages opt in by passing props to <Base/> (e.g.
 * `faq`, `breadcrumbs`); Organization + WebSite are site-wide and live in
 * Seo.astro. SoftwareApplication is auto-attached to the home page.
 *
 * Accuracy guardrail (ARY-399 §6 Truth Ledger): claims here must stay grounded.
 * The app is free to start with no priced tiers (payments stubbed) → the offer
 * is `price: "0"`. Do NOT add review/aggregateRating (no real customers) or
 * certification claims.
 */
import type { Locale } from './i18n';

/** Org node id — referenced by other nodes so the graph stays a single entity. */
export const orgId = (base: string) => `${base}/#org`;
export const websiteId = (base: string) => `${base}/#website`;

/**
 * SoftwareApplication / FinanceApplication with a free offer — home page only
 * (ARY-399 §2d). Category is `FinanceApplication` to match our "family asset
 * vault" wedge, not a generic web app.
 */
export function softwareApplication(base: string, name: string, description: string) {
  return {
    '@type': 'SoftwareApplication',
    '@id': `${base}/#app`,
    name,
    description,
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'iOS, Android, Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      // "Start free" — no priced tiers exist in product (payments stubbed).
      availability: 'https://schema.org/InStock',
    },
    publisher: { '@id': orgId(base) },
  };
}

export interface FaqItem {
  q: string;
  a: string;
}

/** FAQPage node from a list of Q&A pairs (ARY-399 §2d / §4.6). */
export function faqPage(items: FaqItem[]) {
  return {
    '@type': 'FAQPage',
    mainEntity: items.map((it) => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: it.a },
    })),
  };
}

export interface Crumb {
  name: string;
  /** Absolute URL. */
  url: string;
}

/** BreadcrumbList node for deep pages (ARY-399 §2d). */
export function breadcrumbList(crumbs: Crumb[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.url,
    })),
  };
}

/**
 * Phase-1 FAQ content — verbatim from CMO ARY-399 §4.6 (grounded, honesty-gated).
 * Lives here so both the /faq page body and its FAQPage JSON-LD read ONE source,
 * and so it localizes alongside the rest of the catalog. English is the source;
 * translations are layered per `Locale` as they land (English fallback for now).
 */
export const FAQ_ITEMS: Record<Locale, FaqItem[] | null> = {
  en: [
    {
      q: 'Is my data safe?',
      a: 'Yes. Your information is encrypted in transit (TLS) and at rest on managed infrastructure, your password is never stored in plain text, and access is strictly controlled to your account.',
    },
    {
      q: 'Do you sell my data?',
      a: 'No — never. We don’t sell or share your information for advertising.',
    },
    {
      q: 'What does it cost?',
      a: 'Vaulto is free to start. Deeper planning reports are available when you’re ready; you’ll always see what’s included before anything is charged.',
    },
    {
      q: 'Do I have to enter everything by hand?',
      a: 'No — upload a photo or document and Vaulto can read it and suggest the details for you.',
    },
    {
      q: 'Who is Vaulto for?',
      a: 'Families and individuals who want one trusted place to know what they own, keep key documents safe, and plan ahead.',
    },
    {
      q: 'What can I store?',
      a: 'Assets of all kinds — property, accounts, investments, valuables, pensions — plus the documents that go with them.',
    },
    {
      q: 'Can I use Vaulto in my language?',
      a: 'The app is available in 16 languages. We’re adding localized site content market by market.',
    },
  ],
  es: null,
  fr: null,
  de: null,
};

/** FAQ items for a locale, falling back to English until a translation lands. */
export function faqItemsFor(locale: Locale): FaqItem[] {
  return FAQ_ITEMS[locale] ?? FAQ_ITEMS.en!;
}
