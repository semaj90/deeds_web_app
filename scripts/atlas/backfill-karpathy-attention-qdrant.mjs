#!/usr/bin/env node
/**
 * backfill-karpathy-attention-qdrant.mjs
 *
 * Reads gpu:karpathy:scores from Valkey and writes karpathy_attention,
 * karpathy_rank, karpathy_source_ref, and karpathy_indexed_at payloads
 * onto matching Qdrant points in the codebase_chunks_768 collection.
 *
 * Matching uses canonical sourceRef variants so path format differences
 * between Valkey keys and Qdrant payload fields are bridged.
 *
 * Usage:
 *   node scripts/atlas/backfill-karpathy-attention-qdrant.mjs          # dry-run (default)
 *   node scripts/atlas/backfill-karpathy-attention-qdrant.mjs --apply  # write to Qdrant
 *   node scripts/atlas/backfill-karpathy-attention-qdrant.mjs --apply --limit 500
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../..');

const _canonHelperPath = resolve(__dirname, '../lib/canonical-source-ref.mjs');
const { normalizeSourceRef, sourceRefVariants } =
  await import(pathToFileURL(_canonHelperPath).href);

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const LIMIT_ARG = args.find(a => a.startsWith('--limit=') || a === '--limit');
const LIMIT = LIMIT_ARG
  ? parseInt(LIMIT_ARG.includes('=') ? LIMIT_ARG.split('=')[1] : args[args.indexOf('--limit') + 1], 10) || 0
  : 0; // 0 = no limit

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const COLLECTION = 'codebase_chunks_768';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const REDIS_PASS = process.env.REDIS_PASSWORD ?? process.env.VALKEY_PASSWORD ?? '';
const BATCH_SIZE = 25;

console.log(`[backfill-karpathy] mode=${APPLY ? 'APPLY' : 'DRY-RUN'} limit=${LIMIT || 'none'}`);

// ── 1. Load Karpathy scores from Valkey ──────────────────────────────────────

let redis;
try {
  redis = new Redis({
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: REDIS_PASS || undefined,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on('error', () => {});
  await redis.connect();
  await redis.ping();
} catch (err) {
  console.error(`[backfill-karpathy] Redis connect failed: ${err.message}`);
  process.exit(1);
}

const rawScores = await redis.hgetall('gpu:karpathy:scores');
await redis.quit().catch(() => {});

if (!rawScores || Object.keys(rawScores).length === 0) {
  console.error('[backfill-karpathy] gpu:karpathy:scores is empty — run npm run karpathy:gpu first');
  process.exit(1);
}

// Parse and sort by blend descending (highest authority first)
const scoreEntries = Object.entries(rawScores)
  .map(([key, val]) => {
    try { return [key, JSON.parse(val)]; } catch { return null; }
  })
  .filter(Boolean)
  .sort((a, b) => (b[1].blend ?? 0) - (a[1].blend ?? 0));

const entries = LIMIT > 0 ? scoreEntries.slice(0, LIMIT) : scoreEntries;
console.log(`[backfill-karpathy] Loaded ${scoreEntries.length} Karpathy scores, processing ${entries.length}`);

// ── 2. Build lookup: canonical → { blend, attention, pr, rank } ──────────────

const canonicalScoreMap = new Map();
for (let rank = 0; rank < entries.length; rank++) {
  const [key, score] = entries[rank];
  const canonical = normalizeSourceRef(key);
  if (!canonical) continue;
  canonicalScoreMap.set(canonical, { ...score, karpathy_rank: rank + 1 });
}

// ── 3. Scroll Qdrant and update matching points ───────────────────────────────

const PAYLOAD_FIELDS = ['file_path', 'filePath', 'relativePath', 'relative_path',
  'path', 'stable_key', 'stableKey', 'sourceRef', 'source_ref'];

let offset = null;
let totalScrolled = 0;
let totalMatched = 0;
let totalUpdated = 0;
const missedKeys = new Set(canonicalScoreMap.keys());

const nowTs = new Date().toISOString();

while (true) {
  const body = {
    limit: 100,
    with_payload: true,
    with_vector: false,
  };
  if (offset !== null) body.offset = offset;

  let data;
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.error(`[backfill-karpathy] Qdrant scroll error: ${res.status}`);
      break;
    }
    data = await res.json();
  } catch (err) {
    console.error(`[backfill-karpathy] Qdrant scroll failed: ${err.message}`);
    break;
  }

  const points = data.result?.points ?? [];
  if (points.length === 0) break;
  totalScrolled += points.length;
  offset = data.result?.next_page_offset ?? null;

  // Match each point to a Karpathy score entry via canonical sourceRef
  const toUpdate = [];
  for (const pt of points) {
    // Extract any path-like field from the payload
    let rawPath = null;
    for (const field of PAYLOAD_FIELDS) {
      if (pt.payload?.[field]) { rawPath = pt.payload[field]; break; }
    }
    if (!rawPath) continue;

    const canonical = normalizeSourceRef(rawPath);
    if (!canonical) continue;

    const score = canonicalScoreMap.get(canonical);
    if (!score) continue;

    totalMatched++;
    missedKeys.delete(canonical);

    toUpdate.push({
      id: pt.id,
      payload: {
        karpathy_attention: score.attention ?? score.blend ?? 0,
        karpathy_rank: score.karpathy_rank,
        karpathy_source_ref: canonical,
        karpathy_indexed_at: nowTs,
      },
    });
  }

  if (toUpdate.length === 0) {
    if (offset === null) break;
    continue;
  }

  if (APPLY) {
    // Per-point updates (karpathy_rank differs per point so we can't batch).
    for (const item of toUpdate) {
      try {
        const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload: item.payload, points: [item.id] }),
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) totalUpdated++;
      } catch { /* skip */ }
    }
  } else {
    totalUpdated += toUpdate.length;
  }

  if (offset === null) break;
}

// ── 4. Summary ───────────────────────────────────────────────────────────────

const coveragePct = canonicalScoreMap.size > 0
  ? ((totalMatched / canonicalScoreMap.size) * 100).toFixed(1)
  : '0.0';

console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`[backfill-karpathy] Summary`);
console.log(`  Mode:           ${APPLY ? 'APPLY (wrote to Qdrant)' : 'DRY-RUN (no writes)'}`);
console.log(`  Scrolled:       ${totalScrolled} Qdrant points`);
console.log(`  Karpathy keys:  ${canonicalScoreMap.size}`);
console.log(`  Matched:        ${totalMatched} (${coveragePct}% of Karpathy keys)`);
console.log(`  Updated:        ${totalUpdated} Qdrant points`);
console.log(`  Misses:         ${missedKeys.size} Karpathy keys had no Qdrant match`);
console.log('═══════════════════════════════════════════════════════════════');

// Write miss report
const MISS_DIR = resolve(REPO, 'memory/exports');
mkdirSync(MISS_DIR, { recursive: true });
const MISS_REPORT = resolve(MISS_DIR, 'karpathy-qdrant-misses.jsonl');
if (missedKeys.size > 0) {
  const missLines = [...missedKeys].map(key => {
    const score = canonicalScoreMap.get(key);
    return JSON.stringify({
      ts: nowTs,
      canonical: key,
      variants: sourceRefVariants(key),
      blend: score?.blend ?? null,
      pr: score?.pr ?? null,
    });
  });
  writeFileSync(MISS_REPORT, missLines.join('\n') + '\n');
  console.log(`[backfill-karpathy] Miss report: ${MISS_REPORT}`);
}

if (!APPLY) {
  console.log('[backfill-karpathy] Re-run with --apply to write payloads to Qdrant.');
}
