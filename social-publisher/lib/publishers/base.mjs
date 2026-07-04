// PublisherClient — the swappable interface every platform adapter implements.
//
// This is the seam the whole design turns on: the worker maps manifest atoms to
// a PublisherClient and calls `publish()`. Swapping Pinterest for a future
// LinkedIn/TikTok adapter (or a paid aggregator, if that decision ever reverses)
// is a one-line change in the factory — no scheduler/log/media changes.

/**
 * @typedef {Object} PublishOutcome
 * @property {'posted'|'dry-run'|'manual-required'|'error'} status
 * @property {string|null} [remoteId]   platform-side id of the created post
 * @property {string|null} [remoteUrl]  public URL of the created post, if known
 * @property {string|null} [error]      human-readable error (status='error')
 * @property {string|null} [detail]     extra context (e.g. why manual)
 */

export class PublisherClient {
  /** @returns {string} platform key, e.g. 'pinterest' */
  get platform() {
    throw new Error('not implemented');
  }

  /** @returns {boolean} whether this adapter actually posts to a live account */
  get automated() {
    return false;
  }

  /**
   * Publish a single atom.
   * @param {object} atom  normalized manifest atom
   * @param {{ dryRun?: boolean }} [ctx]
   * @returns {Promise<PublishOutcome>}
   */
  async publish(atom, ctx = {}) { // eslint-disable-line no-unused-vars
    throw new Error('not implemented');
  }
}
