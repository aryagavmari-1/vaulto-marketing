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

// NOTE (ARY-449 #8): the old `FAQ_ITEMS`/`faqItemsFor` English-only table that
// lived here was removed. As of ARY-427 the /faq page body AND its FAQPage
// JSON-LD are both built from the SAME per-locale translated overlay
// (`content/faq/<locale>.json`, all 16 locales present) in FaqPage.astro — so
// the structured data is now correctly localized and no English fallback leaks
// under `hreflang="es"`/etc. Keep FAQ content in the content overlays, not here.
