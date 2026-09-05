#!/usr/bin/env node
// Social publisher — cycle entrypoint (run once per day by the scheduler).
//
// Reads a board-approved publish-manifest, works out which atoms are due on the
// Day-0..5 stagger, and flags every due atom for manual posting from the already-
// approved copy + graphic (Track 1), writing the publish-log back.
//
// v1 decision (CEO ARY-2281): Pinterest API automation is DROPPED for v1 —
// Pinterest posts manually like every other platform. No live platform calls are
// made. The Pinterest v5 adapter is kept dormant (see lib/publishers/index.mjs)
// for a possible future revisit.
//
// $0 by design: no paid SaaS, no new infra. Runs on the repo's existing GitHub
// Actions scheduled-cron pattern (see .github/workflows/social-publish.yml) or a
// Render cron job — the worker itself is a portable Node CLI.
//
// Usage:
//   node run.mjs --manifest manifests/<file>.json [--today YYYY-MM-DD] [--dry-run]
//                [--log publish-log/<file>.json] [--no-check-media]

import { basename, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir } from 'node:fs/promises';
import { loadManifest } from './lib/manifest.mjs';
import { PublishLog } from './lib/publishLog.mjs';
import { buildPublishers } from './lib/publishers/index.mjs';
import { runCycle } from './lib/runCycle.mjs';

function parseArgs(argv) {
  const args = { checkMedia: true, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--manifest') args.manifest = argv[++i];
    else if (a === '--all') args.all = argv[++i]; // directory of manifests
    else if (a === '--today') args.today = argv[++i];
    else if (a === '--log') args.log = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--no-check-media') args.checkMedia = false;
  }
  return args;
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

async function resolveManifestPaths(args) {
  if (args.all) {
    const files = await readdir(args.all);
    return files.filter((f) => f.endsWith('.json')).sort().map((f) => join(args.all, f));
  }
  return [args.manifest];
}

async function processManifest(manifestPath, { env, args, today, now, dryRun, publishers }) {
  const manifest = await loadManifest(manifestPath);
  const logPath = args.log || join(dirname(dirname(manifestPath)), 'publish-log', `${manifest.manifestId}.json`);
  const log = await PublishLog.load(logPath);

  const { results, upcoming, counts } = await runCycle({
    manifest, log, publishers, today, now,
    dryRun, checkMedia: args.checkMedia,
  });

  await log.save(now);

  console.log(`\nSocial publisher — ${manifest.manifestId}  (today=${today}, mode=${dryRun ? 'DRY-RUN' : 'LIVE'})`);
  console.log(`goLiveDate=${manifest.goLiveDate}  log=${logPath}`);
  console.log('─'.repeat(64));
  for (const r of results) {
    const tag = r.status.toUpperCase().padEnd(15);
    console.log(`${tag} ${r.platform.padEnd(10)} ${r.atomId}${r.remoteUrl ? '  → ' + r.remoteUrl : ''}`);
    if (r.note) console.log(`  ${' '.repeat(15)} ↳ ${r.note}`);
  }
  for (const u of upcoming) {
    console.log(`${'UPCOMING'.padEnd(15)} ${u.atom.platform.padEnd(10)} ${u.atom.id}  (due in ${u.dueInDays}d)`);
  }
  console.log('─'.repeat(64));
  console.log('counts:', JSON.stringify(counts));
  return counts;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  if (!args.manifest && !args.all) {
    console.error('error: pass --manifest <path> or --all <dir>');
    process.exitCode = 2;
    return;
  }

  const today = args.today || env.RUN_DATE || todayUTC();
  const now = new Date().toISOString();

  // v1 has no automated publishers (Pinterest is manual — CEO ARY-2281), so the
  // worker never makes a live post. `--dry-run` only suppresses the projected
  // publish-log write-back for local testing.
  const dryRun = args.dryRun;

  const publishers = buildPublishers(env);

  const paths = await resolveManifestPaths(args);
  let totalErrors = 0;
  for (const p of paths) {
    const counts = await processManifest(p, { env, args, today, now, dryRun, publishers });
    totalErrors += counts.error || 0;
  }

  // A run is "failed" only if a live post errored — manual/dry-run/held are fine.
  if (totalErrors > 0) {
    console.error(`\n${totalErrors} atom(s) errored across manifests — they will be retried next run.`);
    process.exitCode = 1;
  }
}

// Run when invoked directly (not when imported by tests).
if (process.argv[1] && basename(process.argv[1]) === basename(fileURLToPath(import.meta.url))) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
