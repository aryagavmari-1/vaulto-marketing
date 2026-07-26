/**
 * Search-engine ownership verification tokens (ARY-556).
 *
 * These are NOT secrets — a verification token's whole purpose is to be served
 * publicly in the page <head> so the search engine can read it back. Keeping the
 * value in the repo rather than in a host env var means ownership survives a host
 * migration and can be reviewed in a diff.
 *
 * `PUBLIC_GSC_VERIFICATION` still wins when set, so a host env var can override
 * this without a deploy.
 */

/** Google Search Console HTML-tag verification: the `content="…"` value. */
export const GSC_VERIFICATION = '';
