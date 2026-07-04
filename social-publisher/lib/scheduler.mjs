// Stagger scheduler — decides which atoms are due on a given run day.
//
// Day 0 = goLiveDate. An atom with scheduleDay=N is due on goLiveDate + N days.
// The worker runs once per day (GitHub Actions cron / Render cron) and posts the
// atoms whose due-date is on or before "today" and which have not already been
// published (idempotency is enforced against the publish-log by the caller).

/** UTC midnight for a YYYY-MM-DD string. */
export function utcDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between two YYYY-MM-DD dates (b - a). */
export function daysBetween(a, b) {
  return Math.round((utcDay(b) - utcDay(a)) / DAY_MS);
}

/**
 * Compute which atoms are due to post on `today`.
 *
 * @param {import('./types.js').Manifest} manifest
 * @param {string} today  YYYY-MM-DD (defaults handled by caller)
 * @param {object} [opts]
 * @param {(atomId: string) => boolean} [opts.isDone]  returns true if the atom is already published/settled
 * @param {number} [opts.graceDays=14]  don't (re)post atoms whose due-date is more than this many days in the past
 * @returns {{ due: object[], upcoming: object[], skipped: object[] }}
 */
export function selectDue(manifest, today, opts = {}) {
  const isDone = opts.isDone || (() => false);
  const graceDays = opts.graceDays ?? 14;
  const offsetToday = daysBetween(manifest.goLiveDate, today);

  const due = [];
  const upcoming = [];
  const skipped = [];

  for (const atom of manifest.atoms) {
    if (atom.held) {
      skipped.push({ atom, reasonCode: 'held', reason: 'held (opt-in/manual)' });
      continue;
    }
    if (isDone(atom.id)) {
      skipped.push({ atom, reasonCode: 'settled', reason: 'already settled in publish-log' });
      continue;
    }
    if (atom.scheduleDay > offsetToday) {
      upcoming.push({ atom, dueInDays: atom.scheduleDay - offsetToday });
      continue;
    }
    if (offsetToday - atom.scheduleDay > graceDays) {
      skipped.push({ atom, reasonCode: 'past-grace', reason: `past grace window (${graceDays}d) — post manually if still wanted` });
      continue;
    }
    due.push(atom);
  }

  return { due, upcoming, skipped };
}
