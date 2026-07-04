// Publish-manifest loader + validator.
//
// A manifest is the machine-readable form of a board-approved publish batch
// (contract: ARY-622 `publish-manifest`). It maps each approved "atom" (copy +
// graphic + UTM link + scheduleDay) to a platform and a day on the Day-0..5
// stagger. This module only parses and validates — it never posts anything.

import { readFile } from 'node:fs/promises';

/** Platforms we understand. `pinterest` is automated; the rest degrade to manual. */
export const KNOWN_PLATFORMS = ['pinterest', 'linkedin', 'shortform'];

/** Platforms with a live auto-posting adapter in this build. */
export const AUTOMATED_PLATFORMS = ['pinterest'];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function fail(msg) {
  throw new Error(`Invalid manifest: ${msg}`);
}

/**
 * Validate + normalize a raw manifest object.
 * @param {object} raw
 * @returns {import('./types.js').Manifest}
 */
export function parseManifest(raw) {
  if (!raw || typeof raw !== 'object') fail('not an object');
  if (!raw.manifestId || typeof raw.manifestId !== 'string') fail('missing manifestId');
  if (!ISO_DATE.test(raw.goLiveDate || '')) fail(`goLiveDate must be YYYY-MM-DD (got ${raw.goLiveDate})`);
  if (!Array.isArray(raw.atoms) || raw.atoms.length === 0) fail('atoms must be a non-empty array');

  const mediaBaseUrl = (raw.mediaBaseUrl || 'https://myvaulto.com').replace(/\/+$/, '');
  const seen = new Set();

  const atoms = raw.atoms.map((a, i) => {
    const where = `atoms[${i}]`;
    if (!a.id || typeof a.id !== 'string') fail(`${where}: missing id`);
    if (seen.has(a.id)) fail(`duplicate atom id "${a.id}"`);
    seen.add(a.id);
    if (!KNOWN_PLATFORMS.includes(a.platform)) fail(`${where} (${a.id}): unknown platform "${a.platform}"`);
    if (!Number.isInteger(a.scheduleDay) || a.scheduleDay < 0) fail(`${where} (${a.id}): scheduleDay must be a non-negative integer`);
    if (!a.body || typeof a.body !== 'string') fail(`${where} (${a.id}): missing body`);
    if (!a.link || typeof a.link !== 'string') fail(`${where} (${a.id}): missing link`);
    // Pinterest pins require a title + alt-text + graphic.
    if (a.platform === 'pinterest' && !a.held) {
      if (!a.title) fail(`${where} (${a.id}): pinterest atom missing title`);
      if (!a.graphicKey) fail(`${where} (${a.id}): pinterest atom missing graphicKey`);
    }
    const graphicUrl = a.graphicKey ? `${mediaBaseUrl}/social/${a.graphicKey}.png` : null;
    return {
      id: a.id,
      platform: a.platform,
      scheduleDay: a.scheduleDay,
      held: Boolean(a.held),
      heldReason: a.heldReason || null,
      title: a.title || null,
      body: a.body,
      link: a.link,
      altText: a.altText || null,
      hashtags: Array.isArray(a.hashtags) ? a.hashtags : [],
      graphicKey: a.graphicKey || null,
      graphicUrl,
    };
  });

  return {
    manifestId: raw.manifestId,
    cycle: raw.cycle || raw.manifestId,
    source: raw.source || null,
    goLiveDate: raw.goLiveDate,
    approval: raw.approval || null,
    mediaBaseUrl,
    notes: raw.notes || null,
    atoms,
  };
}

/** Load + parse a manifest JSON file from disk. */
export async function loadManifest(path) {
  const raw = JSON.parse(await readFile(path, 'utf8'));
  return parseManifest(raw);
}
