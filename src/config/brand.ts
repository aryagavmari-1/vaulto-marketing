/**
 * SINGLE SOURCE OF TRUTH for everything brand-/domain-specific.
 *
 * Brand LOCKED by the board on 2026-06-13 (ARY-17): **Vaulto** / myvaulto.com.
 * (`provisional` is now false — the provisional banner/footer note are gone.)
 *
 * The live myvaulto.com domain purchase is in flight (board/CMO handling payment;
 * DNS/email = ARY-27). Canonical URLs below already point at the final domain so
 * the build is go-live-ready; staging just serves the same artifact on a temp host.
 */
export const BRAND = {
  provisional: false,

  name: 'Vaulto',
  shortName: 'Vaulto',
  // `url` is the canonical origin used by Astro/sitemap/OG.
  domain: 'myvaulto.com',
  url: 'https://myvaulto.com',

  // Master tagline (ARY-23 §4 #1) — clearest JTBD, also the hero headline.
  tagline: 'Everything your family owns, in one private place.',
  description:
    'Vaulto turns scattered accounts, property, and documents into one clear picture of your net worth — and gets you ready for life’s big moments. Snap a photo; we do the data entry.',

  // Contact inboxes — provisioned once the domain is owned (ARY-27 / DNS+email).
  email: {
    hello: 'hello@myvaulto.com',
    privacy: 'privacy@myvaulto.com',
  },

  social: {
    linkedin: '',
    x: '',
  },
} as const;

/**
 * Email service provider (waitlist capture). The form POSTs `{ email }` here.
 * Plan recommends Resend (transactional) + MailerLite (marketing) free tiers.
 * Set PUBLIC_ESP_ENDPOINT at build time; when empty the form runs in
 * "preview mode" (captures locally + shows success) so the site is fully
 * demoable before the ESP account exists.
 */
export const ESP = {
  endpoint: import.meta.env.PUBLIC_ESP_ENDPOINT ?? '',
  formId: import.meta.env.PUBLIC_ESP_FORM_ID ?? '',
} as const;

/**
 * Analytics: privacy-friendly, cookieless (Plausible/Umami — ARY-25 spec, $0).
 * When `src`+`domain` are set, the script loads and `window.plausible` becomes
 * the event sink used by track() (see src/lib/analytics.ts). No PII in events.
 */
export const ANALYTICS = {
  domain: import.meta.env.PUBLIC_ANALYTICS_DOMAIN ?? '',
  src: import.meta.env.PUBLIC_ANALYTICS_SRC ?? '',
} as const;
