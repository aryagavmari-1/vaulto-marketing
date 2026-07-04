// Publisher factory — maps a platform to its PublisherClient given the runtime
// config/secrets. Pinterest is automated when its secrets are present; every
// other platform (and Pinterest with missing secrets) degrades to ManualPublisher.

import { PinterestPublisher } from './pinterest.mjs';
import { ManualPublisher } from './manual.mjs';

/**
 * @param {object} env  resolved config (usually from process.env)
 * @param {object} [hooks] { fetchImpl, onTokenRefresh }
 * @returns {Map<string, import('./base.mjs').PublisherClient>}
 */
export function buildPublishers(env, hooks = {}) {
  const publishers = new Map();

  const hasPinterest = env.PINTEREST_ACCESS_TOKEN && env.PINTEREST_BOARD_ID;
  if (hasPinterest) {
    publishers.set('pinterest', new PinterestPublisher({
      accessToken: env.PINTEREST_ACCESS_TOKEN,
      refreshToken: env.PINTEREST_REFRESH_TOKEN,
      appId: env.PINTEREST_APP_ID,
      appSecret: env.PINTEREST_APP_SECRET,
      boardId: env.PINTEREST_BOARD_ID,
      fetchImpl: hooks.fetchImpl,
      onTokenRefresh: hooks.onTokenRefresh,
    }));
  } else {
    publishers.set('pinterest', new ManualPublisher(
      'pinterest',
      'Pinterest secrets not provisioned yet (awaiting founder OAuth + CEO checkpoint)',
    ));
  }

  // Not automated in v1 — approved copy is posted manually (Track 1).
  publishers.set('linkedin', new ManualPublisher('linkedin', 'LinkedIn org auto-posting is a stretch goal — kept manual in v1'));
  publishers.set('shortform', new ManualPublisher('shortform', 'Short-form video kept manual in v1 (~1 atom/cycle)'));

  return publishers;
}

/** Resolve the publisher for an atom, falling back to a manual adapter. */
export function publisherFor(publishers, atom) {
  return publishers.get(atom.platform) || new ManualPublisher(atom.platform, 'unknown platform');
}
