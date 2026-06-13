/**
 * SINGLE SOURCE OF TRUTH for everything brand-/domain-specific.
 *
 * ⚠️  BRAND IS PROVISIONAL. The name + domain below are the CMO's *current*
 *     recommended pick and are pending board approval (approval f9b21c08 —
 *     "Pick a brand name (fresh, more distinctive set) + authorize domain").
 *     The whole site is built brand-agnostically so that confirming the brand
 *     is a one-file edit:
 *
 *       1. Set `provisional: false`.
 *       2. Update `name`, `shortName`, `domain`, `url`, `email.*` to the approved values.
 *       3. Drop in CMO copy for /security + /privacy (C1) and /blog (C2).
 *       4. Set ESP + analytics IDs from env (see .env.example).
 *       5. `npm run build` → deploy.
 *     Also update the brand text baked into two static assets: public/og.svg
 *     and public/robots.txt (sitemap URL).
 *
 * Current candidates (approval f9b21c08): Kithvault (kithvault.com, rec.) ·
 * Stowevault (stowevault.com) · FamilyNetWorth (familynetworth.com).
 * NOTE: the prior set (Our Asset Vault / HearthVault, approval 59f8fc72) was
 * REJECTED by the board as too literal — kept brand-agnostic so it cost 0 rework.
 */
export const BRAND = {
  provisional: true,

  name: 'Kithvault',
  shortName: 'Kithvault',
  // No scheme-less host here; `url` is the canonical origin used by Astro/sitemap.
  domain: 'kithvault.com',
  url: 'https://kithvault.com',

  tagline: 'Everything your family owns, in one private place — and a plan for what happens next.',
  description:
    'A private family asset vault that turns scattered accounts and documents into a clear net-worth picture and an estate-ready plan — so when life happens, your family is prepared.',

  // Contact inboxes (provisioned once the domain is owned — ARY-27 / DNS+email).
  email: {
    hello: 'hello@kithvault.com',
    privacy: 'privacy@kithvault.com',
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
