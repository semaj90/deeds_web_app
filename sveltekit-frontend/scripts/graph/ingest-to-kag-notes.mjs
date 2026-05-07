#!/usr/bin/env node
/**
 * ingest-to-kag-notes.mjs
 *
 * Reads the latest memory/runs/<run_id>/ingest.jsonl and writes each record
 * as a Redis wiki note (wiki:note:graph:* keys, 6h TTL) so ACE retrieval
 * can surface graph analysis artifacts in the KAG pipeline.
 *
 * Redis key conventions:
 *   wiki:note:graph:cluster:{clusterKey}  — cluster_context records
 *   wiki:note:graph:ace:{filename}        — ace_file_relations records
 *
 * Usage:
 *   node scripts/graph/ingest-to-kag-notes.mjs
 *   node scripts/graph/ingest-to-kag-notes.mjs --dry-run
 *   node scripts/graph/ingest-to-kag-notes.mjs --run-id=2026-05-07T02-47-34
 *
 * Environment (from .env):
 *   REDIS_URL  — default redis://localhost:6379
 */

import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const RUNS_DIR = resolve(ROOT, 'memory/runs');

// Parse CLI flags
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const runIdArg = argv.find((a) => a.startsWith('--run-id='));
const explicitRunId = runIdArg ? runIdArg.slice(9) : null;

const WIKI_TTL = 6 * 60 * 60; // 6h — matches wiki:note:* convention

// Load .env for Redis credentials
try {
  const { config } = await import('dotenv');
  config({ path: resolve(ROOT, '.env') });
} catch { /* dotenv optional */ }

// ── Find latest ingest.jsonl ──────────────────────────────────────────────────

function findIngestFile(runId) {
  if (runId) {
    const p = join(RUNS_DIR, runId, 'ingest.jsonl');
    if (!existsSync(p)) throw new Error(`Run not found: ${p}`);
    return { runId, path: p };
  }

  // Walk runs dir, find latest ISO timestamp dir with ingest.jsonl
  if (!existsSync(RUNS_DIR)) throw new Error(`Runs directory not found: ${RUNS_DIR}`);

  const entries = readdirSync(RUNS_DIR)
    .filter((e) => /^\d{4}-\d{2}-\d{2}T/.test(e))
    .filter((e) => existsSync(join(RUNS_DIR, e, 'ingest.jsonl')))
    .sort();

  if (!entries.length) throw new Error('No runs with ingest.jsonl found');

  const latest = entries[entries.length - 1];
  return { runId: latest, path: join(RUNS_DIR, latest, 'ingest.jsonl') };
}

let ingestFile;
try {
  ingestFile = findIngestFile(explicitRunId);
} catch (err) {
  console.error('[kag-ingest] ✗', err.message);
  process.exit(1);
}

console.log(`[kag-ingest] Reading run: ${ingestFile.runId}`);

// ── Parse ingest.jsonl ────────────────────────────────────────────────────────

const lines = readFileSync(ingestFile.path, 'utf-8').split('\n').filter(Boolean);
const records = lines.map((l) => {
  try { return JSON.parse(l); } catch { return null; }
}).filter(Boolean);

const clusterRecords = records.filter((r) => r.type === 'cluster_context');
const aceRecords     = records.filter((r) => r.type === 'ace_file_relations');
const edgeSummary    = records.find((r) => r.type === 'edge_summary');

console.log(`[kag-ingest] Found ${clusterRecords.length} cluster records, ${aceRecords.length} ACE file records`);

if (edgeSummary) {
  console.log(`[kag-ingest] Edge summary: ${edgeSummary.totalEdges?.toLocaleString() ?? '?'} edges across ${edgeSummary.totalFiles?.toLocaleString() ?? '?'} files`);
}

if (!clusterRecords.length && !aceRecords.length) {
  console.log('[kag-ingest] Nothing to write — ingest.jsonl has no cluster or ACE records');
  process.exit(0);
}

if (dryRun) {
  console.log('\n[kag-ingest] DRY RUN — keys that would be written:');
  for (const r of clusterRecords) {
    const key = `wiki:note:graph:cluster:${r.cluster_key}`;
    console.log(`  SETEX ${key} ${WIKI_TTL} <cluster_context JSON>`);
  }
  for (const r of aceRecords) {
    const key = `wiki:note:graph:ace:${r.file}`;
    console.log(`  SETEX ${key} ${WIKI_TTL} <ace_file_relations JSON>`);
  }
  console.log(`\n[kag-ingest] Would write ${clusterRecords.length + aceRecords.length} keys`);
  process.exit(0);
}

// ── Write to Redis ────────────────────────────────────────────────────────────

let redis;
try {
  const { default: Redis } = await import('ioredis');
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 2,
    connectTimeout: 5000,
    lazyConnect: true,
  });
  await redis.connect();
} catch (err) {
  console.error('[kag-ingest] ✗ Redis unavailable:', err.message ?? err);
  console.error('[kag-ingest]   Start Redis and set REDIS_URL, then retry');
  process.exit(1);
}

let written = 0;
let errors  = 0;
const t0 = Date.now();

// Write pipeline for efficiency
const pipeline = redis.pipeline();

for (const r of clusterRecords) {
  const key = `wiki:note:graph:cluster:${r.cluster_key}`;
  const value = JSON.stringify({
    kind: 'graph_cluster',
    runId: ingestFile.runId,
    clusterKey: r.cluster_key,
    fileCount: r.file_count,
    topoClasses: r.topo_classes ?? [],
    topTags: r.top_tags ?? [],
    topFiles: (r.top_files ?? []).filter(Boolean),
    createdAt: new Date().toISOString(),
  });
  pipeline.setex(key, WIKI_TTL, value);
  written++;
}

for (const r of aceRecords) {
  const key = `wiki:note:graph:ace:${r.file}`;
  const value = JSON.stringify({
    kind: 'graph_ace_relations',
    runId: ingestFile.runId,
    file: r.file,
    outbound: r.outbound ?? [],
    createdAt: new Date().toISOString(),
  });
  pipeline.setex(key, WIKI_TTL, value);
  written++;
}

try {
  const results = await pipeline.exec();
  if (results) {
    for (const [err] of results) {
      if (err) errors++;
    }
  }
} catch (err) {
  console.error('[kag-ingest] ✗ Pipeline error:', err.message ?? err);
  errors = written;
  written = 0;
}

await redis.quit().catch(() => {});

const durationMs = Date.now() - t0;
const ok = written - errors;
console.log(`[kag-ingest] ✓ Wrote ${ok} wiki notes in ${durationMs}ms${errors ? ` (${errors} errors)` : ''}`);
console.log(`[kag-ingest]   Keys: wiki:note:graph:cluster:* (${clusterRecords.length}) + wiki:note:graph:ace:* (${aceRecords.length})`);
console.log(`[kag-ingest]   TTL: ${WIKI_TTL}s (6h) — refresh by re-running after graphify:map`);

if (errors) process.exit(1);
