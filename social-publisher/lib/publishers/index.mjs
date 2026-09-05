// Publisher factory — maps a platform to its PublisherClient.
//
// v1 decision (CEO ARY-2281 / ARY-2283): Pinterest API automation is DROPPED for
// v1 — Pinterest posts manually (Track 1) like every other platform. Pinterest
// trial access is capped to read scopes, so `POST /v5/pins` cannot succeed until
// Pinterest grants Standard/write access; rather than block go-live on that, the
// approved copy + graphic are flagged `manual-required` and a human posts them.
//
// The Pinterest v5 adapter (`pinterest.mjs`) is kept dormant (not wired here) so
// automation can be re-enabled with a one-line factory change IF the revisit
// trigger fires: (a) Pinterest volume justifies the build, or (b) Pinterest
// grants Standard/write access without the in-app demo requirement. Until then
// there is NO further build/OAuth work on Pinterest automation.

import { ManualPublisher } from './manual.mjs';

/**
 * @param {object} env  resolved config (usually from process.env)
 * @param {object} [hooks] { fetchImpl, onTokenRefresh }  (reserved; unused in v1)
 * @returns {Map<string, import('./base.mjs').PublisherClient>}
 */
export function buildPublishers(env, hooks = {}) { // eslint-disable-line no-unused-vars
  const publishers = new Map();

  // Pinterest → MANUAL in v1 (CEO ARY-2281). No live API posting regardless of
  // secrets. To re-enable automation, wire PinterestPublisher here (see header).
  publishers.set('pinterest', new ManualPublisher(
    'pinterest',
    'Pinterest API automation deferred for v1 (CEO ARY-2281) — post manually from the approved copy',
  ));

  // Not automated in v1 — approved copy is posted manually (Track 1).
  publishers.set('linkedin', new ManualPublisher('linkedin', 'LinkedIn org auto-posting is a stretch goal — kept manual in v1'));
  publishers.set('shortform', new ManualPublisher('shortform', 'Short-form video kept manual in v1 (~1 atom/cycle)'));

  return publishers;
}

/** Resolve the publisher for an atom, falling back to a manual adapter. */
export function publisherFor(publishers, atom) {
  return publishers.get(atom.platform) || new ManualPublisher(atom.platform, 'unknown platform');
}
