#!/usr/bin/env node
/**
 * hyperrag-log-triage.mjs
 * Phase E: Atlas Chunk Index / Log Triage
 *
 * Terminal phase of the HyperRAG pipeline. Reads Phase D output and:
 *   1. Builds a per-cluster sidecar (minified JSON with ranked chunk refs)
 *   2. Sorts chunks by Karpathy blend → RRF → PageRank fallback
 *   3. Writes audit log to logs/hyperrag-stream/<ISO-timestamp>.jsonl
 *   4. Writes per-cluster sidecar files to logs/hyperrag-stream/clusters/
 *   5. Optionally writes GRPO reward signal back to Redis
 *
 * Usage:
 *   node scripts/atlas/hyperrag-log-triage.mjs --input /tmp/phaseD.json
 *
 *   # Full pipeline:
 *   node scripts/atlas/hyperrag-dense-multiquery.mjs --query "auth flow" --json \
 *     | node scripts/atlas/hyperrag-couchdb-enrich.mjs \
 *     | node scripts/atlas/hyperrag-cuda-stream.mjs --query "auth flow" \
 *     | node scripts/atlas/hyperrag-log-triage.mjs
 *
 * Env:
 *   LOG_DIR       default logs/hyperrag-stream  (relative to sveltekit-frontend)
 *   REDIS_URL     default redis://127.0.0.1:6379
 *   GRPO_WRITE    default false  (set 'true' to write reward signal to Redis)
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

// ── Config ─────────────────────────────────────────────────────────────────────
const argv   = process.argv.slice(2);
const argGet = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

const INPUT_PATH  = argGet('--input');
const DRY_RUN     = argv.includes('--dry-run');
const JSON_OUT    = argv.includes('--json');
const VERBOSE     = argv.includes('--verbose');

const LOG_DIR    = path.resolve(ROOT, process.env.LOG_DIR ?? 'logs/hyperrag-stream');
const REDIS_URL  = process.env.REDIS_URL  ?? 'redis://127.0.0.1:6379';
const GRPO_WRITE = process.env.GRPO_WRITE === 'true';
const MAX_SIDECAR_CHUNKS = 20;

// ── Redis (optional — for GRPO writeback) ─────────────────────────────────────
const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: () => null,
});
redis.on('error', () => {});
let redisReady = false;
if (GRPO_WRITE) {
  try {
    await redis.connect();
    await redis.ping();
    redisReady = true;
  } catch { /* no GRPO writeback */ }
}

// ── Read input ─────────────────────────────────────────────────────────────────
async function readInput() {
  if (INPUT_PATH) return JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks.map(c => Buffer.from(c))).toString());
}

// ── Scoring for final sort ─────────────────────────────────────────────────────
function finalScore(hit) {
  const blend    = hit.karpathy?.blend ?? 0;
  const rrf      = hit.rrfScore       ?? 0;
  const pagerank = hit.karpathy?.pr   ?? 0;
  // Weighted composite: blend dominates, RRF as tie-break, PR as secondary
  return blend * 0.5 + rrf * 10 * 0.3 + pagerank * 0.2;
}

// ── Per-cluster sidecar builder ────────────────────────────────────────────────
function buildClusterSidecar(clusterLabel, hits, clusterIdx) {
  const members = hits
    .filter((_, i) => /* rough bucketing by rank */ Math.floor(i / Math.max(1, Math.ceil(hits.length / 8))) === clusterIdx)
    .slice(0, MAX_SIDECAR_CHUNKS);

  return {
    clusterId: clusterIdx,
    label: clusterLabel,
    chunkCount: members.length,
    topSource: members[0]?.source_ref ?? null,
    chunks: members.map(h => ({
      id: h.id,
      src: h.source_ref,
      score: parseFloat(finalScore(h).toFixed(4)),
      blend: h.karpathy?.blend ?? null,
      wiki: h.wikiEnrichment?.length > 0,
    })),
  };
}

// ── Ensure log dirs exist ──────────────────────────────────────────────────────
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// ── Main ──────────────────────────────────────────────────────────────────────
const t0  = Date.now();
const iso = new Date().toISOString().replace(/[:.]/g, '-');

if (!JSON_OUT) {
  console.log('\n[phase-e] Atlas Chunk Index / Log Triage');
  console.log(`[phase-e] Log dir: ${LOG_DIR}`);
  console.log(`[phase-e] GRPO writeback: ${GRPO_WRITE ? 'ENABLED' : 'disabled'}`);
}

let phaseDResult;
try {
  phaseDResult = await readInput();
} catch (e) {
  console.error(`[phase-e] Failed to read Phase D input: ${e.message}`);
  process.exit(1);
}

const hits         = phaseDResult.results ?? [];
const phaseD       = phaseDResult.phaseD  ?? {};
const clusterLabels = phaseD.clusterLabels ?? [];
const query        = phaseDResult.query ?? '';

if (!JSON_OUT) console.log(`[phase-e] Hits: ${hits.length}  Clusters: ${clusterLabels.length}`);

// 1. Final sort
const sorted = [...hits].sort((a, b) => finalScore(b) - finalScore(a));

if (DRY_RUN) {
  console.log('[phase-e] Dry run — skipping writes');
  console.log(`[phase-e] Would sort ${sorted.length} hits, build ${clusterLabels.length} sidecars`);
  process.exit(0);
}

// 2. Build per-cluster sidecars
const sidecars = clusterLabels.map((label, idx) => buildClusterSidecar(label, sorted, idx));

// 3. Build audit record
const auditRecord = {
  ts: new Date().toISOString(),
  query,
  pipelinePhases: {
    A: { sidecarBackend: phaseDResult.sidecarBackend ?? 'unknown', clusterIds: phaseDResult.clusterIds ?? [] },
    B: { resultCount: phaseDResult.resultCount ?? hits.length, latencyMs: phaseDResult.latencyMs ?? 0 },
    C: phaseDResult.phaseC ?? null,
    D: { cudaBackend: phaseD.cudaBackend, centroidCount: phaseD.centroidCount, inferLatencyMs: phaseD.inferLatencyMs },
    E: { hitCount: sorted.length, clusterCount: sidecars.length },
  },
  synthesis: phaseD.synthesis ?? null,
  topResults: sorted.slice(0, 10).map(h => ({
    src: h.source_ref,
    score: parseFloat(finalScore(h).toFixed(4)),
    blend: h.karpathy?.blend ?? null,
    wiki: h.wikiEnrichment?.length > 0,
  })),
};

// 4. Write audit log (JSONL — one record per run)
if (!DRY_RUN) {
  ensureDir(LOG_DIR);
  const auditPath = path.join(LOG_DIR, `${iso}.jsonl`);
  fs.appendFileSync(auditPath, JSON.stringify(auditRecord) + '\n');
  if (!JSON_OUT) console.log(`[phase-e] Audit log: ${path.relative(ROOT, auditPath)}`);
}

// 5. Write per-cluster sidecar files
if (sidecars.length > 0 && !DRY_RUN) {
  const clusterDir = path.join(LOG_DIR, 'clusters');
  ensureDir(clusterDir);
  for (const sidecar of sidecars) {
    const fname = `cluster-${String(sidecar.clusterId).padStart(2, '0')}-${iso}.json`;
    fs.writeFileSync(path.join(clusterDir, fname), JSON.stringify(sidecar));
  }
  if (!JSON_OUT) console.log(`[phase-e] Sidecars: ${sidecars.length} → ${path.relative(ROOT, clusterDir)}`);
}

// 6. GRPO reward writeback to Redis
let grpoKey = null;
if (GRPO_WRITE && redisReady && phaseD.synthesis) {
  // Reward = fraction of hits that have wiki enrichment (proxy for coverage quality)
  const wikiCoverage = sorted.filter(h => h.wikiEnrichment?.length > 0).length / Math.max(sorted.length, 1);
  const inferOk      = !phaseD.inferError;
  const grpoReward   = parseFloat((wikiCoverage * 0.6 + (inferOk ? 0.4 : 0)).toFixed(4));

  grpoKey = `grpo:hyperrag:${Date.now()}`;
  await redis.setex(grpoKey, 3600, JSON.stringify({
    query,
    reward: grpoReward,
    wikiCoverage,
    centroidCount: phaseD.centroidCount,
    hitCount: sorted.length,
    ts: new Date().toISOString(),
  }));
  if (!JSON_OUT) console.log(`[phase-e] GRPO reward=${grpoReward.toFixed(3)} → ${grpoKey}`);
}

if (redisReady) redis.disconnect();

const phaseEResult = {
  ...phaseDResult,
  phaseE: {
    sortedHitCount: sorted.length,
    clusterSidecarCount: sidecars.length,
    auditLogWritten: !DRY_RUN,
    grpoKey: grpoKey ?? null,
    latencyMs: Date.now() - t0,
  },
  results: sorted,  // replace with final-sorted results
};

if (JSON_OUT) {
  console.log(JSON.stringify(phaseEResult, null, 2));
} else {
  console.log(`\n${'─'.repeat(72)}`);
  console.log(`  Final sorted hits: ${sorted.length}`);
  console.log(`  Cluster sidecars:  ${sidecars.length}`);
  if (VERBOSE) {
    for (const h of sorted.slice(0, 8)) {
      const s = finalScore(h).toFixed(4);
      const w = h.wikiEnrichment?.length > 0 ? ' [wiki]' : '';
      console.log(`  ${s}  ${h.source_ref ?? h.id}${w}`);
    }
  }
  if (phaseD.synthesis) {
    console.log(`\n  Synthesis:\n`);
    console.log(phaseD.synthesis.split('\n').map(l => `  ${l}`).join('\n'));
  }
  console.log(`\n  Phase E total: ${Date.now() - t0}ms`);
  console.log('─'.repeat(72));
}