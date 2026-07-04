// Orchestrator for one publishing cycle run. Pure + injectable (now/today/fetch)
// so the whole Day-0..5 flow is unit-testable in dry-run without any network.

import { selectDue } from './scheduler.mjs';
import { publisherFor } from './publishers/index.mjs';
import { checkReachable } from './media.mjs';

/**
 * @param {object} o
 * @param {import('./types.js').Manifest} o.manifest
 * @param {import('./publishLog.mjs').PublishLog} o.log
 * @param {Map} o.publishers
 * @param {string} o.today  YYYY-MM-DD
 * @param {string} o.now    ISO timestamp (recorded into the log)
 * @param {boolean} [o.dryRun]
 * @param {boolean} [o.checkMedia]  HEAD the graphic URL before a live post (default true when not dry-run)
 * @param {typeof fetch} [o.fetchImpl]
 * @returns {Promise<{results: object[], counts: object}>}
 */
export async function runCycle(o) {
  const { manifest, log, publishers, today, now } = o;
  const dryRun = Boolean(o.dryRun);
  const checkMedia = o.checkMedia ?? !dryRun;
  const fetchImpl = o.fetchImpl || fetch;

  const { due, upcoming, skipped } = selectDue(manifest, today, {
    isDone: (id) => log.isSettled(manifest.manifestId, id),
  });

  const results = [];

  // Record non-due dispositions so the publish-log is a complete cycle picture.
  for (const s of skipped) {
    if (s.reasonCode === 'settled') continue; // leave the existing terminal entry untouched
    if (s.reasonCode === 'held') {
      const e = log.record(manifest.manifestId, s.atom, { status: 'held', detail: s.reason }, now);
      results.push({ atomId: s.atom.id, platform: s.atom.platform, status: e.status, note: s.reason });
    } else if (s.reasonCode === 'past-grace') {
      const e = log.record(manifest.manifestId, s.atom, { status: 'skipped', detail: s.reason }, now);
      results.push({ atomId: s.atom.id, platform: s.atom.platform, status: e.status, note: s.reason });
    }
  }

  for (const atom of due) {
    const publisher = publisherFor(publishers, atom);
    let outcome;

    // Guard live posts against a missing/unreachable graphic — degrade, don't break.
    if (publisher.automated && !dryRun && checkMedia && atom.graphicUrl) {
      const reach = await checkReachable(atom.graphicUrl, fetchImpl);
      if (!reach.ok) {
        outcome = {
          status: 'manual-required',
          detail: `graphic not reachable (${reach.status ?? reach.error}) at ${atom.graphicUrl} — post manually once the graphic is live`,
        };
      }
    }

    if (!outcome) {
      outcome = await publisher.publish(atom, { dryRun });
    }

    const entry = log.record(manifest.manifestId, atom, outcome, now);
    results.push({
      atomId: atom.id,
      platform: atom.platform,
      status: entry.status,
      remoteUrl: entry.remoteUrl,
      note: outcome.detail || outcome.error || null,
    });
  }

  const counts = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});
  counts.upcoming = upcoming.length;

  return { results, upcoming, counts };
}
