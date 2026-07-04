// ManualPublisher — graceful-degradation adapter for any platform we do not (yet)
// auto-post to (LinkedIn org, TikTok/Reels/Shorts). It never calls a network; it
// simply flags the atom in the publish-log as `manual-required` so a human posts
// it from the already-approved copy. This is the "$0 manual Track 1" fallback.

import { PublisherClient } from './base.mjs';

export class ManualPublisher extends PublisherClient {
  constructor(platform, reason) {
    super();
    this._platform = platform;
    this._reason = reason || 'no automated adapter for this platform in v1';
  }

  get platform() {
    return this._platform;
  }

  get automated() {
    return false;
  }

  async publish(atom) {
    return {
      status: 'manual-required',
      detail: `${this._reason}. Copy is approved and ready — post manually. Graphic: ${atom.graphicUrl || 'n/a'}`,
    };
  }
}
