// Self-test for the marketing→app cross-domain attribution helper (ARY-1729 / §3D).
// Run: `node scripts/attribution.selftest.mjs` (or `pnpm run attribution:selftest`).
// Matches the repo's dependency-free `--selftest` convention (see check-claims.mjs).
import assert from 'node:assert/strict';
import {
  isAppLink,
  mediumFromPath,
  campaignFromPath,
  withAttribution,
  decorateAppLinks,
  APP_ORIGIN,
} from '../src/lib/appAttribution.js';

// — isAppLink —
assert.equal(isAppLink('https://app.myvaulto.com'), true);
assert.equal(isAppLink('https://app.myvaulto.com/sign-up'), true);
assert.equal(isAppLink('/blog/how-to-make-a-home-inventory/'), false, 'same-site link is not an app link');
assert.equal(isAppLink('https://myvaulto.com/security/'), false);
assert.equal(isAppLink('mailto:hello@myvaulto.com'), false);
assert.equal(isAppLink(null), false);

// — medium / campaign derivation —
assert.equal(mediumFromPath('/blog/how-to-make-a-home-inventory/'), 'blog');
assert.equal(mediumFromPath('/pt/blog/como-fazer-inventario/'), 'blog');
assert.equal(mediumFromPath('/security/'), 'site');
assert.equal(mediumFromPath('/'), 'site');
assert.equal(campaignFromPath('/blog/household-net-worth-formula/'), 'household-net-worth-formula');
assert.equal(campaignFromPath('/security/'), 'security');
assert.equal(campaignFromPath('/'), 'home');

// — withAttribution: a blog CTA gets the full, non-null four-param set —
{
  const out = withAttribution('https://app.myvaulto.com', '/blog/how-to-make-a-home-inventory/');
  const p = new URL(out).searchParams;
  assert.equal(p.get('utm_source'), 'marketing_site');
  assert.equal(p.get('utm_medium'), 'blog');
  assert.equal(p.get('utm_campaign'), 'how-to-make-a-home-inventory');
  assert.equal(p.get('ref'), '/blog/how-to-make-a-home-inventory/');
}

// — withAttribution: homepage hero CTA —
{
  const p = new URL(withAttribution('https://app.myvaulto.com/sign-up', '/')).searchParams;
  assert.equal(p.get('utm_medium'), 'site');
  assert.equal(p.get('utm_campaign'), 'home');
  assert.equal(p.get('ref'), '/');
}

// — idempotent: an already-tagged link is untouched (no double-decoration) —
{
  const once = withAttribution('https://app.myvaulto.com', '/security/');
  assert.equal(withAttribution(once, '/security/'), once);
}

// — non-app links are returned unchanged —
assert.equal(withAttribution('/blog/x/', '/blog/x/'), '/blog/x/');

// — decorateAppLinks over a minimal fake DOM (component CTA + inline blog link) —
{
  /** @type {any} */
  const anchors = [
    { href: 'https://app.myvaulto.com', getAttribute(k) { return k === 'href' ? this.href : null; }, setAttribute(k, v) { if (k === 'href') this.href = v; } },
    { href: '/blog/other/', getAttribute(k) { return k === 'href' ? this.href : null; }, setAttribute(k, v) { if (k === 'href') this.href = v; } },
    { href: 'https://app.myvaulto.com/sign-up', getAttribute(k) { return k === 'href' ? this.href : null; }, setAttribute(k, v) { if (k === 'href') this.href = v; } },
  ];
  const doc = { querySelectorAll: () => anchors };
  const changed = decorateAppLinks(doc, '/blog/home-contents-inventory-for-insurance/');
  assert.equal(changed, 2, 'both app links decorated, same-site link skipped');
  assert.ok(anchors[0].href.includes('utm_source=marketing_site'));
  assert.ok(anchors[0].href.includes('ref=%2Fblog%2Fhome-contents-inventory-for-insurance%2F'));
  assert.equal(anchors[1].href, '/blog/other/', 'same-site link untouched');
  assert.ok(anchors[2].href.includes('utm_campaign=home-contents-inventory-for-insurance'));
}

// — no PII key can be produced: the param set is exactly the agreed four —
{
  const keys = [...new URL(withAttribution('https://app.myvaulto.com', '/security/')).searchParams.keys()];
  assert.deepEqual(keys, ['utm_source', 'utm_medium', 'utm_campaign', 'ref']);
}

assert.equal(APP_ORIGIN, 'https://app.myvaulto.com');
console.log('attribution selftest: OK (all assertions passed)');
