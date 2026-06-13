/**
 * SINGLE SOURCE OF TRUTH for everything brand-/domain-specific.
 *
 * ✅  BRAND LOCKED 2026-06-13: `Vaulto` — domain `myvaulto.com`.
 *     Board pick on ARY-39 (approval 8fea6e98-29c2-4353-aea9-ee50877fc06e),
 *     superseding the rejected Kithvault set (approval f9b21c08). The site was
 *     built brand-agnostically, so locking the brand was a one-file edit here
 *     plus two static assets (public/og.svg, public/robots.txt sitemap URL).
 *
 *     Remaining to go fully live (tracked on ARY-27 / DNS+email):
 *       - Domain purchase + DNS for myvaulto.com (board → CMO).
 *       - Set ESP + analytics IDs from env (see .env.example).
 *       - `npm run build` → deploy (Cloudflare Pages / Vercel free tier, $0).
 *     The hello@/privacy@ inboxes go live once ARY-27 provisions email.
 */
export const BRAND = {
  provisional: false,

  name: 'Vaulto',
  shortName: 'Vaulto',
  // No scheme-less host here; `url` is the canonical origin used by Astro/sitemap.
  domain: 'myvaulto.com',
  url: 'https://myvaulto.com',

  // Primary tagline locked from messaging deck §4 (ARY-23); long form kept as description.
  tagline: 'Everything your family owns, in one place.',
  description:
    'A private family asset vault that turns scattered accounts and documents into a clear net-worth picture and an estate-ready plan — so when life happens, your family is prepared.',

  // Contact inboxes (provisioned once the domain is owned — ARY-27 / DNS+email).
  email: {
    hello: 'hello@myvaulto.com',
    privacy: 'privacy@myvaulto.com',
  },

  social: {
    // Filled in at launch; left empty renders nothing.
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
  // Optional public list/form id some ESPs require.
  formId: import.meta.env.PUBLIC_ESP_FORM_ID ?? '',
} as const;

/** Analytics: privacy-friendly, cookieless (e.g. Plausible/Cloudflare Web Analytics). */
export const ANALYTICS = {
  domain: import.meta.env.PUBLIC_ANALYTICS_DOMAIN ?? '',
  src: import.meta.env.PUBLIC_ANALYTICS_SRC ?? '',
} as const;
