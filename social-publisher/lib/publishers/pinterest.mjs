// PinterestPublisher — direct Pinterest API v5 adapter (no paid aggregator).
//
// Posts a pin via `POST /v5/pins` using an image_url media source, so the graphic
// is fetched by Pinterest from our own public URL (the deployed marketing site is
// the $0 media host — no separate object-store upload step needed).
//
// Auth: a long-lived-ish access token (~30 days) + refresh token. On a 401 we
// refresh once (via `POST /v5/oauth/token`, Basic client auth) and retry, so the
// scheduled worker self-heals across the token's expiry without human touch.
//
// Scopes: boards:read, boards:write, pins:read, pins:write — Pinterest's POST /v5/pins
// rejects a narrower grant (live 401: Missing ['boards:write','pins:read']).
// Tokens are provided via env (Render/GitHub secrets) — never committed.

import { PublisherClient } from './base.mjs';

const API = 'https://api.pinterest.com/v5';

export class PinterestPublisher extends PublisherClient {
  /**
   * @param {object} cfg
   * @param {string} cfg.accessToken
   * @param {string} [cfg.refreshToken]
   * @param {string} [cfg.appId]
   * @param {string} [cfg.appSecret]
   * @param {string} cfg.boardId
   * @param {typeof fetch} [cfg.fetchImpl]  injectable for tests
   * @param {(token: string) => void} [cfg.onTokenRefresh]  callback with a fresh access token
   */
  constructor(cfg) {
    super();
    this.accessToken = cfg.accessToken;
    this.refreshToken = cfg.refreshToken || null;
    this.appId = cfg.appId || null;
    this.appSecret = cfg.appSecret || null;
    this.boardId = cfg.boardId;
    this.fetch = cfg.fetchImpl || fetch;
    this.onTokenRefresh = cfg.onTokenRefresh || null;
  }

  get platform() {
    return 'pinterest';
  }

  get automated() {
    return true;
  }

  /** Exchange the refresh token for a new access token. Returns the new token. */
  async refreshAccessToken() {
    if (!this.refreshToken || !this.appId || !this.appSecret) {
      throw new Error('cannot refresh: refreshToken + appId + appSecret required');
    }
    const basic = Buffer.from(`${this.appId}:${this.appSecret}`).toString('base64');
    const res = await this.fetch(`${API}/oauth/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
      }).toString(),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.access_token) {
      throw new Error(`token refresh failed (${res.status}): ${JSON.stringify(json)}`);
    }
    this.accessToken = json.access_token;
    if (json.refresh_token) this.refreshToken = json.refresh_token;
    if (this.onTokenRefresh) this.onTokenRefresh(this.accessToken);
    return this.accessToken;
  }

  _pinBody(atom) {
    return {
      board_id: this.boardId,
      title: atom.title || undefined,
      description: atom.body,
      link: atom.link,
      alt_text: atom.altText || undefined,
      media_source: { source_type: 'image_url', url: atom.graphicUrl },
    };
  }

  async _postPin(atom) {
    return this.fetch(`${API}/pins`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(this._pinBody(atom)),
    });
  }

  async publish(atom, ctx = {}) {
    if (!atom.graphicUrl) {
      return { status: 'error', error: `atom ${atom.id} has no graphicUrl` };
    }
    if (!this.boardId) {
      return { status: 'error', error: 'PINTEREST_BOARD_ID not configured' };
    }
    if (ctx.dryRun) {
      return {
        status: 'dry-run',
        detail: `would POST /v5/pins to board ${this.boardId} with image ${atom.graphicUrl}`,
      };
    }

    try {
      let res = await this._postPin(atom);
      // Self-heal on an expired/invalid token, once.
      if (res.status === 401 && this.refreshToken && this.appId && this.appSecret) {
        await this.refreshAccessToken();
        res = await this._postPin(atom);
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { status: 'error', error: `pin create failed (${res.status}): ${JSON.stringify(json)}` };
      }
      const id = json.id || null;
      return {
        status: 'posted',
        remoteId: id,
        remoteUrl: id ? `https://www.pinterest.com/pin/${id}/` : null,
      };
    } catch (err) {
      return { status: 'error', error: String(err.message || err) };
    }
  }
}
