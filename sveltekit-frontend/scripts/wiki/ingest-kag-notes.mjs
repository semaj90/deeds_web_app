#!/usr/bin/env node
/**
 * gap_rel_006: ingest.jsonl → Redis wiki:note:dir:* KAG notes
 *
 * Reads the latest memory/runs/<runId>/ingest.jsonl produced by
 * build-codebase-relationships.mjs and writes cluster_context entries
 * into Redis as wiki:note:dir:{cluster_key} so ACE can read them
 * via the existing wiki:note:dir:* lookup path.
 *
 * Usage:
 *   node scripts/wiki/ingest-kag-notes.mjs
 *   node scripts/wiki/ingest-kag-notes.mjs --dry-run
 *   node scripts/wiki/ingest-kag-notes.mjs --run <runId>
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import dotenv from 'dotenv';
import Redis from 'ioredis';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
dotenv.config({ path: resolve(ROOT, '.env') });

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const RUN_ARG_IDX = args.indexOf('--run');
const RUN_FILTER = RUN_ARG_IDX !== -1 ? args[RUN_ARG_IDX + 1] : null;

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const TTL = 6 * 60 * 60; // 6h — matches wiki:note:* TTL convention

const RUNS_DIR = resolve(ROOT, 'memory/runs');

// ── Find latest run with ingest.jsonl ────────────────────────────────────────
function findIngestFile() {
  if (!existsSync(RUNS_DIR)) return null;
  const runs = readdirSync(RUNS_DIR).sort().reverse();
  for (const run of runs) {
    if (RUN_FILTER && run !== RUN_FILTER) continue;
    const ingestPath = resolve(RUNS_DIR, run, 'ingest.jsonl');
    if (existsSync(ingestPath)) return { runId: run, ingestPath };
  }
  return null;
}

// ── Parse ingest.jsonl ───────────────────────────────────────────────────────
function parseIngestJsonl(ingestPath) {
  const lines = readFileSync(ingestPath, 'utf8').trim().split('\n');
  const records = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch { /* skip malformed */ }
  }
  return records;
}

// ── Build Redis key from cluster_key ─────────────────────────────────────────
function clusterKeyToRedisId(clusterKey) {
  // e.g. "cluster:gpu:6" → "cluster_gpu_6"
  // e.g. "server-ace:retrieval-spine" → "server_ace_retrieval_spine"
  return clusterKey.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

// ── Main ─────────────────────────────────────────────────────────────────────
const t0 = Date.now();
console.log(`\n[kag-ingest] Scanning ${RUNS_DIR} for latest ingest.jsonl...`);

const found = findIngestFile();
if (!found) {
  console.error('[kag-ingest] No ingest.jsonl found — run build-codebase-relationships.mjs first');
  process.exit(1);
}

const { runId, ingestPath } = found;
console.log(`[kag-ingest] Using run: ${runId}`);
console.log(`[kag-ingest] File: ${ingestPath}`);

const records = parseIngestJsonl(ingestPath);
console.log(`[kag-ingest] Parsed ${records.length} records`);

// Filter to cluster_context entries
const clusterRecords = records.filter(r => r.type === 'cluster_context');
const summaryRecord = records.find(r => r.type === 'edge_summary');

console.log(`[kag-ingest] ${clusterRecords.length} cluster_context entries to ingest`);
if (summaryRecord) {
  console.log(`[kag-ingest] Edge summary: ${summaryRecord.totalEdges} edges across ${summaryRecord.totalFiles} files`);
}

if (clusterRecords.length === 0) {
  console.log('[kag-ingest] Nothing to ingest — no cluster_context records in ingest.jsonl');
  process.exit(0);
}

// Build wiki notes
const wikiNotes = clusterRecords.map(r => {
  const id = clusterKeyToRedisId(r.cluster_key);
  const redisKey = `wiki:note:dir:${id}`;
  const note = {
    type: 'cluster_wiki_note',
    stableKey: id,
    cluster_key: r.cluster_key,
    file_count: r.file_count ?? 0,
    topo_classes: r.topo_classes ?? [],
    top_tags: r.top_tags ?? [],
    top_files: (r.top_files ?? []).filter(Boolean),
    runId,
    source: 'ingest.jsonl',
    // Edge summary overlay if present
    totalEdges: summaryRecord?.totalEdges ?? null,
    edgeCounts: summaryRecord?.edgeCounts ?? null,
    createdAt: new Date().toISOString(),
  };
  return { id, redisKey, note };
});

// Write to Redis
if (DRY_RUN) {
  console.log('\n[kag-ingest] [DRY RUN] Would write:');
  for (const { redisKey, note } of wikiNotes.slice(0, 5)) {
    console.log(`  ${redisKey} → { cluster_key: ${note.cluster_key}, file_count: ${note.file_count}, tags: [${note.top_tags.slice(0,4).join(',')}] }`);
  }
  if (wikiNotes.length > 5) console.log(`  ... and ${wikiNotes.length - 5} more`);
} else {
  let redis;
  try {
    redis = new Redis(REDIS_URL, { lazyConnect: true, enableOfflineQueue: false });
    await redis.connect();
  } catch (e) {
    console.error(`[kag-ingest] Redis unavailable: ${e.message}`);
    process.exit(1);
  }

  const pipeline = redis.pipeline();
  for (const { redisKey, note } of wikiNotes) {
    pipeline.setex(redisKey, TTL, JSON.stringify(note));
  }
  await pipeline.exec();
  await redis.quit();
  console.log(`\n[kag-ingest] Written ${wikiNotes.length} wiki:note:dir:* keys (TTL ${TTL}s)`);

  // Sample a few keys to verify
  console.log('[kag-ingest] Sample keys written:');
  for (const { redisKey } of wikiNotes.slice(0, 3)) {
    console.log(`  ${redisKey}`);
  }
}

// Write manifest.json as durable closure proof (gap_rel_006 detector reads this)
const KAG_NOTES_DIR = resolve(ROOT, 'memory/kag-notes');
const manifest = {
  runId,
  createdAt: new Date().toISOString(),
  totalNotes: wikiNotes.length,
  keyPrefix: 'wiki:note:dir:',
  ttlSeconds: TTL,
  dryRun: DRY_RUN,
  sampleKeys: wikiNotes.slice(0, 5).map(n => n.redisKey),
};
if (!DRY_RUN) {
  mkdirSync(KAG_NOTES_DIR, { recursive: true });
  const manifestPath = resolve(KAG_NOTES_DIR, 'manifest.json');
  try {
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`[kag-ingest] Manifest written to memory/kag-notes/manifest.json`);
  } catch (error) {
    console.warn(`[kag-ingest] Manifest write failed: ${error.message} — continuing without durable manifest`);
  }
}

const durationMs = Date.now() - t0;
console.log(`\n✅ KAG notes ingested in ${durationMs}ms${DRY_RUN ? ' (dry-run)' : ''}.`);
