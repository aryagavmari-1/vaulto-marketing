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
  // The live product the marketing CTAs hand off to. "Get started free" and
  // the footer "Sign in →" link point here (ARY-404 §2). Single source so a
  // domain change is one edit.
  app: 'https://app.myvaulto.com',

  // Master tagline (ARY-23 §4 #1) — clearest JTBD, also the hero headline.
  tagline: 'Everything your family owns, in one private place.',
  description:
    'Vaulto turns scattered accounts, property, and documents into one clear picture of your net worth — and gets you ready for life’s big moments. Snap a photo; we do the data entry.',

  // Contact inboxes — provisioned once the domain is owned (ARY-27 / DNS+email).
  email: {
    hello: 'hello@myvaulto.com',
    privacy: 'privacy@myvaulto.com',
  },

  /**
   * Registered operating entity behind the Terms of Service (ARY-4503).
   *
   * Board-confirmed on ARY-1732 and supplied by the CEO on ARY-4504. The name
   * exists in neither this repo nor the product repo — it only ever lived in
   * that issue thread, which is why a source sweep could not find it.
   *
   * The counterparty is NAMED IN THE APPROVED PROSE (`content/terms/*.json` →
   * "Who you are agreeing with"), so these fields are not what puts the entity
   * on the page. They exist for the registration detail the prose does not
   * carry, and `TermsPage.astro` renders that block only once there is some.
   *
   * `registrationNumber` + `address` RESOLVED on ARY-4506 / ARY-4508. The CNPJ
   * carried since 2026-08-17 was `7.187.794/0001-61` — 13 digits where a CNPJ
   * has 14 — so it was held blank rather than repaired by inference. Two
   * independent methods now agree, and NEITHER is sufficient alone:
   *
   *  1. mod-11 arithmetic narrows the 13-digit string to exactly TWO valid
   *     single-digit insertions, `57.187.794/0001-61` and `71.877.594/0001-61`.
   *     (The obvious leading-zero repair `07.187.794/0001-61` is not one of
   *     them — its check digits compute to 93.) Arithmetic alone cannot pick
   *     between the two survivors.
   *  2. the Receita Federal public register, read via two independent mirrors
   *     (brasilapi.com.br, minhareceita.org), returns MERKADO CONSULTORIA LTDA
   *     / ATIVA / MATRIZ / Sociedade Empresária Limitada for the first and
   *     `não encontrado` for the second. The name it returns is the same one
   *     the board confirmed on ARY-1732, independently of this repair.
   *
   * So the published number is register-sourced, not inferred. `address` is the
   * registered seat exactly as the register holds it, re-cased from its ALL
   * CAPS form; the register records NO complemento, so none is invented. These
   * are the SAME two facts the Play trader declaration needs (ARY-4502).
   *
   * ⚠️ `address` is a single-locale string (`BRAND` is `as const`, one value per
   * field) and carries the pt-BR rendering, per the ARY-4508 scope guard — only
   * the country word and the `CEP` label would differ in en-GB. Do not restructure
   * `BRAND` for that; if it ever needs to localize, move the line into
   * `content/terms/<locale>.json` beside `entity.lead`, which is already per-locale.
   */
  legal: {
    entity: 'MERKADO CONSULTORIA LTDA',
    jurisdiction: 'Brazil',
    registrationNumber: '57.187.794/0001-61',
    address: 'Av. Pedroso de Morais, 103, Pinheiros, São Paulo — SP, CEP 05419-000, Brasil',
  },

  // Social profiles — populated once the accounts exist (ARY-27). When set,
  // `linkedin`/`x` feed Organization JSON-LD `sameAs`, and `xHandle` (the
  // "@vaulto" form) drives the Twitter card `twitter:site` attribution.
  social: {
    linkedin: '',
    x: '',
    xHandle: '',
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
