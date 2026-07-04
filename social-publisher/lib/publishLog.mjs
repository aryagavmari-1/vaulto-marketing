// Publish-log: durable record of what has been posted, for idempotency +
// write-back per cycle (ARY-654 DoD). Keyed by `${manifestId}:${atomId}` so a
// re-run never double-posts an atom. Committed back to the repo by the workflow
// (same pattern as kpis.json), giving an auditable posting history.
//
// Entry statuses:
//   posted          — auto-published to the live platform (has remoteId)
//   dry-run         — would have posted; no live call made (no creds / DRY_RUN)
//   manual-required — platform not automated in this build; a human must post it
//   held            — atom held opt-in/manual by the manifest
//   error           — attempted, platform rejected (see `error`); safe to retry
//   skipped         — outside the posting window

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Statuses that mean "do not attempt this atom again". */
export const TERMINAL_STATUSES = new Set(['posted', 'manual-required', 'held', 'skipped']);

export function keyFor(manifestId, atomId) {
  return `${manifestId}:${atomId}`;
}

export class PublishLog {
  constructor(path, data) {
    this.path = path;
    this.data = data || { entries: {} };
    if (!this.data.entries) this.data.entries = {};
  }

  static async load(path) {
    try {
      const raw = JSON.parse(await readFile(path, 'utf8'));
      return new PublishLog(path, raw);
    } catch (err) {
      if (err.code === 'ENOENT') return new PublishLog(path, { entries: {} });
      throw err;
    }
  }

  get(manifestId, atomId) {
    return this.data.entries[keyFor(manifestId, atomId)] || null;
  }

  /** True if the atom is in a terminal (do-not-retry) state. */
  isSettled(manifestId, atomId) {
    const e = this.get(manifestId, atomId);
    return Boolean(e && TERMINAL_STATUSES.has(e.status));
  }

  /**
   * Record an outcome. `now` is injected (ISO string) to keep this deterministic
   * and testable.
   */
  record(manifestId, atom, outcome, now) {
    this.data.entries[keyFor(manifestId, atom.id)] = {
      manifestId,
      atomId: atom.id,
      platform: atom.platform,
      scheduleDay: atom.scheduleDay,
      status: outcome.status,
      remoteId: outcome.remoteId || null,
      remoteUrl: outcome.remoteUrl || null,
      error: outcome.error || null,
      detail: outcome.detail || null,
      updatedAt: now,
    };
    return this.data.entries[keyFor(manifestId, atom.id)];
  }

  async save(now) {
    this.data.updatedAt = now;
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(this.data, null, 2) + '\n');
  }
}
