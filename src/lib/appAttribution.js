// @ts-check
// Cross-domain acquisition attribution for marketing→app CTAs (ARY-1729 / §3D).
//
// The product funnel (first-party analytics on app.myvaulto.com) and this marketing
// site live on separate domains — "complementary, not duplicative". To let the funnel
// credit organic content for a downstream signup, every CTA that hands off to the app
// gets aggregate attribution params appended:
//
//   utm_source=marketing_site  utm_medium=<blog|site>  utm_campaign=<page slug>  ref=<page path>
//
// Campaign/source strings + the originating page path only — NEVER PII (§4 privacy
// guardrail). The app's server-side props allowlist enforces the same four keys, so a
// signup_started event can carry these and nothing else.

export const APP_ORIGIN = 'https://app.myvaulto.com';
export const UTM_SOURCE = 'marketing_site';

// Relative hrefs are resolved against this dummy marketing base purely to compare
// origins — an app link is always the absolute app origin, so relative links (same-site
// navigation) correctly test false.
const MARKETING_BASE = 'https://myvaulto.com';

/**
 * True when `href` points at the product app origin (the hand-off we attribute).
 * @param {string | null | undefined} href
 * @param {string} [appOrigin]
 */
export function isAppLink(href, appOrigin = APP_ORIGIN) {
  if (!href) return false;
  try {
    return new URL(href, MARKETING_BASE).origin === new URL(appOrigin).origin;
  } catch {
    return false;
  }
}

/**
 * utm_medium: 'blog' for blog paths (including locale-prefixed like /pt/blog/...),
 * otherwise 'site'.
 * @param {string} pathname
 */
export function mediumFromPath(pathname) {
  return /(^|\/)blog(\/|$)/.test(pathname || '') ? 'blog' : 'site';
}

/**
 * utm_campaign: the content slug — the last non-empty path segment, or 'home' for '/'.
 * (`ref` still carries the full path; campaign gives a coarser per-content grouping.)
 * @param {string} pathname
 */
export function campaignFromPath(pathname) {
  const segs = (pathname || '/').split('/').filter(Boolean);
  return segs.length === 0 ? 'home' : segs[segs.length - 1];
}

/**
 * Return `href` with the four attribution params appended, when it is an app link.
 * Idempotent: an href that already carries utm_source is returned unchanged, so a
 * re-run (e.g. after a View-Transitions swap) never double-decorates.
 * @param {string} href
 * @param {string} pagePath  the marketing page the CTA sits on (location.pathname)
 * @param {string} [appOrigin]
 */
export function withAttribution(href, pagePath, appOrigin = APP_ORIGIN) {
  if (!isAppLink(href, appOrigin)) return href;
  let u;
  try {
    u = new URL(href, MARKETING_BASE);
  } catch {
    return href;
  }
  if (u.searchParams.has('utm_source')) return href; // already tagged
  const path = pagePath || '/';
  u.searchParams.set('utm_source', UTM_SOURCE);
  u.searchParams.set('utm_medium', mediumFromPath(path));
  u.searchParams.set('utm_campaign', campaignFromPath(path));
  u.searchParams.set('ref', path);
  return u.toString();
}

/**
 * Rewrite every app-bound anchor in `doc` to carry attribution for `pagePath`.
 * Covers both component CTAs (Header/Footer/hero/FinalCta → BRAND.app) and inline
 * blog-content links in one pass, so no per-file link editing is needed. Returns the
 * number of anchors updated.
 * @param {Document} doc
 * @param {string} pagePath
 * @param {string} [appOrigin]
 */
export function decorateAppLinks(doc, pagePath, appOrigin = APP_ORIGIN) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return 0;
  let n = 0;
  for (const a of Array.from(doc.querySelectorAll('a[href]'))) {
    const href = a.getAttribute('href');
    if (!isAppLink(href, appOrigin)) continue;
    const next = withAttribution(href, pagePath, appOrigin);
    if (next !== href) {
      a.setAttribute('href', next);
      n++;
    }
  }
  return n;
}
