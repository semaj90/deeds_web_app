#!/usr/bin/env node
/**
 * unified-ingester.mjs
 *
 * Single-command orchestrator that wires every existing extractor into the
 * canonical pipeline:
 *
 *   1. build-all-lanes-parent-atlas.mjs    (NDJSON + CSV per lane)
 *   2. duckdb parent_atlas_join_v2.sql     (parent_atlas_full.parquet)
 *   3. push-parent-atlas-to-couchdb.mjs    (CouchDB durable archive)
 *   4. load-parent-atlas-to-redis.mjs      (Redis warmup for Bitfrost)
 *   5. (optional) ingest-couchdb-mapreduce.mjs (replication checks)
 *
 * Each stage is independently skippable via flags. All failures
 * surface but do not block downstream stages (best-effort fan-out).
 *
 * Usage:
 *   node scripts/atlas/ingester/unified-ingester.mjs --apply
 *   node scripts/atlas/ingester/unified-ingester.mjs --apply --skip couchdb,redis
 *   node scripts/atlas/ingester/unified-ingester.mjs --apply --only lanes,duckdb
 *   node scripts/atlas/ingester/unified-ingester.mjs --dry-run
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../../..');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const DRY = argv.includes('--dry-run') || !APPLY;
const VERBOSE = argv.includes('--verbose');

function parseListFlag(flag) {
  const i = argv.indexOf(flag);
  if (i < 0) return null;
  const val = argv[i + 1];
  return val ? val.split(',').map((s) => s.trim()) : null;
}
const SKIP = parseListFlag('--skip') || [];
const ONLY = parseListFlag('--only');

const STAGES = [
  {
    name: 'lanes',
    label: 'Build all-lanes NDJSON+CSV',
    cmd: ['node', 'scripts/atlas/build-all-lanes-parent-atlas.mjs', '--apply'],
    dryCmd: ['node', 'scripts/atlas/build-all-lanes-parent-atlas.mjs'],
  },
  {
    name: 'duckdb',
    label: 'DuckDB map-reduce join',
    cmd: ['duckdb', '.tmp/ingest/atlas.duckdb', '-c', '.read scripts/sql/parent_atlas_join_v2.sql'],
    dryCmd: null, // duckdb has no dry-run, only run on apply
  },
  {
    name: 'couchdb',
    label: 'Push parent atlas → CouchDB',
    cmd: ['node', 'scripts/atlas/push-parent-atlas-to-couchdb.mjs', '--apply'],
    dryCmd: ['node', 'scripts/atlas/push-parent-atlas-to-couchdb.mjs'],
  },
  {
    name: 'redis',
    label: 'Warm Redis cache for Bitfrost',
    cmd: ['node', 'scripts/atlas/load-parent-atlas-to-redis.mjs', '--apply'],
    dryCmd: ['node', 'scripts/atlas/load-parent-atlas-to-redis.mjs'],
  },
];

function shouldRun(stage) {
  if (ONLY) return ONLY.includes(stage.name);
  return !SKIP.includes(stage.name);
}

function runStage(stage) {
  const cmd = DRY ? stage.dryCmd : stage.cmd;
  if (!cmd) {
    console.log(`  ⏭️  skip (no-op in dry-run)`);
    return { ok: true, skipped: true, durationMs: 0 };
  }
  const t0 = Date.now();
  const r = spawnSync(cmd[0], cmd.slice(1), {
    cwd: ROOT,
    stdio: VERBOSE ? 'inherit' : 'pipe',
    encoding: 'utf8',
    shell: false,
  });
  const durationMs = Date.now() - t0;
  if (!VERBOSE && r.stdout) {
    // Show last few lines for context
    const tail = r.stdout.split('\n').filter((l) => l.trim()).slice(-5).join('\n');
    if (tail) console.log(tail.split('\n').map((l) => '    ' + l).join('\n'));
  }
  if (r.status !== 0) {
    console.log(`  ❌ exit=${r.status}`);
    if (!VERBOSE && r.stderr) console.log(r.stderr.split('\n').slice(0, 10).map((l) => '    ' + l).join('\n'));
    return { ok: false, status: r.status, durationMs };
  }
  return { ok: true, durationMs };
}

// ─── Main ────────────────────────────────────────────────────────────────

console.log('\n══ Unified Ingester ════════════════════════════════════');
console.log(`  Mode: ${DRY ? 'DRY-RUN' : 'APPLY'}`);
console.log(`  Stages: ${STAGES.filter(shouldRun).map((s) => s.name).join(' → ') || '(none)'}`);
console.log(`  Skip: ${SKIP.join(',') || 'none'}`);
console.log('');

const results = [];
const overallStart = Date.now();

for (const stage of STAGES) {
  if (!shouldRun(stage)) {
    console.log(`──[skip] ${stage.label}`);
    results.push({ stage: stage.name, skipped: true });
    continue;
  }
  console.log(`──[${stage.name}] ${stage.label}`);
  const res = runStage(stage);
  results.push({ stage: stage.name, ...res });
  console.log(`  ${res.ok ? '✅' : '❌'} ${stage.name} (${res.durationMs}ms)\n`);
}

const totalMs = Date.now() - overallStart;

// Report
const report = {
  timestamp: new Date().toISOString(),
  mode: DRY ? 'dry-run' : 'apply',
  totalDurationMs: totalMs,
  stages: results,
  ok: results.every((r) => r.ok || r.skipped),
};

console.log('══ Summary ═══════════════════════════════════════════');
console.log(`  Total time: ${totalMs}ms`);
console.log(`  Overall: ${report.ok ? '✅ PASS' : '❌ FAIL'}`);
for (const r of results) {
  const mark = r.skipped ? '⏭️ ' : r.ok ? '✅ ' : '❌ ';
  console.log(`  ${mark}${r.stage.padEnd(10)} ${r.durationMs ? r.durationMs + 'ms' : ''}`);
}

if (!DRY) {
  const reportPath = path.join(ROOT, 'memory', 'exports', 'unified-ingester-report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`  📝 Report → ${reportPath}`);
}

process.exit(report.ok ? 0 : 1);
