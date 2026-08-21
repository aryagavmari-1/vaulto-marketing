import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, readFile } from 'node:fs/promises';

import { parseManifest } from '../lib/manifest.mjs';
import { selectDue } from '../lib/scheduler.mjs';
import { PublishLog } from '../lib/publishLog.mjs';
import { PinterestPublisher } from '../lib/publishers/pinterest.mjs';
import { buildPublishers } from '../lib/publishers/index.mjs';
import { runCycle } from '../lib/runCycle.mjs';

const NOW = '2026-07-02T09:00:00.000Z';

function sampleRaw() {
  return {
    manifestId: 'test-cycle',
    goLiveDate: '2026-07-02',
    mediaBaseUrl: 'https://myvaulto.com',
    atoms: [
      { id: 'P1', platform: 'pinterest', scheduleDay: 0, graphicKey: 'pin-p1', title: 'T1', body: 'b1', link: 'https://x/?a', altText: 'alt' },
      { id: 'L2', platform: 'linkedin', scheduleDay: 0, body: 'b2', link: 'https://x/?b' },
      { id: 'P3', platform: 'pinterest', scheduleDay: 1, graphicKey: 'pin-p3', title: 'T3', body: 'b3', link: 'https://x/?c', altText: 'alt3' },
      { id: 'V1', platform: 'shortform', scheduleDay: 3, body: 'v', link: 'https://x/?d' },
      { id: 'P5', platform: 'pinterest', scheduleDay: 7, graphicKey: 'pin-p5', title: 'T5', body: 'b5', link: 'https://x/?e', altText: 'a5', held: true },
    ],
  };
}

test('parseManifest normalizes graphic URLs and validates', () => {
  const m = parseManifest(sampleRaw());
  assert.equal(m.atoms[0].graphicUrl, 'https://myvaulto.com/social/pin-p1.png');
  assert.equal(m.atoms[4].held, true);
});

test('parseManifest rejects bad input', () => {
  assert.throws(() => parseManifest({ manifestId: 'x', goLiveDate: 'nope', atoms: [] }), /goLiveDate/);
  assert.throws(() => parseManifest({ manifestId: 'x', goLiveDate: '2026-01-01', atoms: [
    { id: 'A', platform: 'pinterest', scheduleDay: 0, body: 'b', link: 'l' }, // pinterest, no title/graphic
  ] }), /missing (title|graphicKey)/);
  assert.throws(() => parseManifest({ manifestId: 'x', goLiveDate: '2026-01-01', atoms: [
    { id: 'A', platform: 'pinterest', scheduleDay: 0, title: 't', graphicKey: 'g', body: 'b', link: 'l' },
    { id: 'A', platform: 'linkedin', scheduleDay: 1, body: 'b', link: 'l' },
  ] }), /duplicate/);
});

test('selectDue: day 0 posts scheduleDay<=0, holds held, defers future', () => {
  const m = parseManifest(sampleRaw());
  const { due, upcoming, skipped } = selectDue(m, '2026-07-02');
  assert.deepEqual(due.map((a) => a.id).sort(), ['L2', 'P1']);
  assert.deepEqual(upcoming.map((u) => u.atom.id).sort(), ['P3', 'V1']);
  assert.equal(skipped.find((s) => s.atom.id === 'P5').reasonCode, 'held');
});

test('selectDue: settled atoms are excluded via isDone', () => {
  const m = parseManifest(sampleRaw());
  const { due } = selectDue(m, '2026-07-05', { isDone: (id) => id === 'P1' });
  assert.ok(!due.find((a) => a.id === 'P1'));
  assert.ok(due.find((a) => a.id === 'V1')); // day 3, now day 3
});

test('selectDue: past-grace atoms are skipped not posted', () => {
  const m = parseManifest(sampleRaw());
  const { due, skipped } = selectDue(m, '2026-08-01', { graceDays: 14 });
  assert.equal(due.length, 0);
  assert.ok(skipped.some((s) => s.reasonCode === 'past-grace'));
});

test('PublishLog idempotency keys + terminal detection', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plog-'));
  const log = new PublishLog(join(dir, 'log.json'));
  const atom = { id: 'P1', platform: 'pinterest', scheduleDay: 0 };
  log.record('m', atom, { status: 'posted', remoteId: '123' }, NOW);
  assert.equal(log.isSettled('m', 'P1'), true);
  assert.equal(log.isSettled('m', 'P9'), false);
  await log.save(NOW);
  const reloaded = await PublishLog.load(join(dir, 'log.json'));
  assert.equal(reloaded.get('m', 'P1').remoteId, '123');
  // error is NOT terminal — retryable
  reloaded.record('m', { id: 'P2', platform: 'pinterest' }, { status: 'error', error: 'boom' }, NOW);
  assert.equal(reloaded.isSettled('m', 'P2'), false);
});

test('PinterestPublisher: dry-run makes no network call', async () => {
  let called = false;
  const p = new PinterestPublisher({ accessToken: 't', boardId: 'b', fetchImpl: () => { called = true; } });
  const out = await p.publish({ id: 'P1', graphicUrl: 'https://x/g.png', title: 'T', body: 'd', link: 'l' }, { dryRun: true });
  assert.equal(out.status, 'dry-run');
  assert.equal(called, false);
});

test('PinterestPublisher: live post success maps to posted + url', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    return { ok: true, status: 201, json: async () => ({ id: 'pin_999' }) };
  };
  const p = new PinterestPublisher({ accessToken: 't', boardId: 'board_1', fetchImpl });
  const out = await p.publish({ id: 'P1', graphicUrl: 'https://x/g.png', title: 'T', body: 'd', link: 'https://l', altText: 'a' });
  assert.equal(out.status, 'posted');
  assert.equal(out.remoteId, 'pin_999');
  assert.match(out.remoteUrl, /pin_999/);
  assert.equal(calls[0].body.board_id, 'board_1');
  assert.equal(calls[0].body.media_source.url, 'https://x/g.png');
});

test('PinterestPublisher: 401 triggers one refresh + retry', async () => {
  let pinAttempts = 0;
  let refreshed = false;
  const fetchImpl = async (url) => {
    if (url.endsWith('/oauth/token')) {
      refreshed = true;
      return { ok: true, status: 200, json: async () => ({ access_token: 'fresh' }) };
    }
    pinAttempts++;
    if (pinAttempts === 1) return { ok: false, status: 401, json: async () => ({ message: 'expired' }) };
    return { ok: true, status: 201, json: async () => ({ id: 'pin_after_refresh' }) };
  };
  const p = new PinterestPublisher({
    accessToken: 'old', refreshToken: 'r', appId: 'id', appSecret: 'sec', boardId: 'b', fetchImpl,
  });
  const out = await p.publish({ id: 'P1', graphicUrl: 'https://x/g.png', title: 'T', body: 'd', link: 'l' });
  assert.equal(refreshed, true);
  assert.equal(out.status, 'posted');
  assert.equal(out.remoteId, 'pin_after_refresh');
  assert.equal(p.accessToken, 'fresh');
});

test('runCycle dry-run: pinterest→dry-run, linkedin/shortform→manual, held→held', async () => {
  const m = parseManifest(sampleRaw());
  const dir = await mkdtemp(join(tmpdir(), 'cyc-'));
  const log = new PublishLog(join(dir, 'log.json'));
  const publishers = buildPublishers({}); // no creds → pinterest is ManualPublisher, but dryRun path uses it
  const { results, counts } = await runCycle({
    manifest: m, log, publishers, today: '2026-07-07', now: NOW, dryRun: true,
  });
  const byId = Object.fromEntries(results.map((r) => [r.atomId, r.status]));
  // With no creds the Pinterest slot is a ManualPublisher → manual-required.
  assert.equal(byId.P1, 'manual-required');
  assert.equal(byId.L2, 'manual-required');
  assert.equal(byId.P5, 'held');
  assert.ok(counts['manual-required'] >= 3);
});

test('runCycle: pinterest is MANUAL in v1 even with creds present (CEO ARY-2281)', async () => {
  // v1 decision: Pinterest API automation is dropped — Pinterest posts manually
  // like every other platform, so the worker must NEVER make a live pin call even
  // if Pinterest secrets happen to be set in the environment.
  const m = parseManifest(sampleRaw());
  const dir = await mkdtemp(join(tmpdir(), 'cyc2-'));
  const logPath = join(dir, 'log.json');
  const fetchImpl = async () => {
    throw new Error('no network call may be made — Pinterest is manual in v1');
  };
  const env = { PINTEREST_ACCESS_TOKEN: 't', PINTEREST_BOARD_ID: 'b' };
  const publishers = buildPublishers(env, { fetchImpl });

  const log = await PublishLog.load(logPath);
  const r1 = await runCycle({ manifest: m, log, publishers, today: '2026-07-02', now: NOW, fetchImpl });
  await log.save(NOW);
  // P1 (pinterest, due day 0) and L2 (linkedin) both flagged manual — no live post.
  assert.equal(r1.results.find((r) => r.atomId === 'P1').status, 'manual-required');
  assert.equal(r1.results.find((r) => r.atomId === 'L2').status, 'manual-required');
  assert.equal(r1.counts.posted || 0, 0);
});
