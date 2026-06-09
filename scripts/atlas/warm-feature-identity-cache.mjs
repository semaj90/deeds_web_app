#!/usr/bin/env node
/**
 * warm-feature-identity-cache.mjs
 *
 * Step 5 of identity alignment: populate Valkey with feature↔sourceRef↔Qdrant
 * cross-reference keys so downstream tools can resolve identities in O(1).
 *
 * See memory/contracts/valkey-feature-cache-contract.md for the full key schema.
 *
 * Usage:
 *   node scripts/atlas/warm-feature-identity-cache.mjs          # dry-run
 *   node scripts/atlas/warm-feature-identity-cache.mjs --apply
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const _helperPath = resolve(__dirname, '../lib/canonical-source-ref.mjs');
const { normalizeSourceRef, sourceRefHash: computeHash } =
  await import(pathToFileURL(_helperPath).href);

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const SCROLL_LIMIT = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '0', 10) || 0;

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const COLLECTION = 'codebase_chunks_768';
const TTL = 24 * 3600; // 24h

console.log(`[identity-warm] mode=${APPLY ? 'APPLY' : 'DRY-RUN'} limit=${SCROLL_LIMIT || 'none'}`);

// ── Redis ────────────────────────────────────────────────────────────────────

let redis;
try {
  redis = new Redis({
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD ?? 'redis',
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on('error', () => {});
  await redis.connect();
  await redis.ping();
} catch (err) {
  console.error(`[identity-warm] Redis unavailable: ${err.message}`);
  process.exit(1);
}

// ── Scroll Qdrant ─────────────────────────────────────────────────────────────

const PAYLOAD_FIELDS = [
  'file_path', 'filePath', 'relativePath', 'relative_path',
  'path', 'stable_key', 'stableKey', 'sourceRef', 'source_ref',
];

// feature_id → Set<canonicalSourceRef>
const featureToRefs = new Map();
// feature_id → Set<qdrant_point_id>
const featureToPoints = new Map();
// canonicalSourceRef hash → Set<feature_id>
const hashToFeatures = new Map();
// canonicalSourceRef hash → Set<qdrant_point_id>
const hashToPoints = new Map();

let offset = null;
let totalScrolled = 0;
let totalMapped = 0;

console.log(`[identity-warm] Scrolling ${COLLECTION}...`);

while (true) {
  const body = { limit: 200, with_payload: true, with_vector: false };
  if (offset !== null) body.offset = offset;
  if (SCROLL_LIMIT > 0 && totalScrolled >= SCROLL_LIMIT) break;

  let data;
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) { console.error(`[identity-warm] Qdrant ${res.status}`); break; }
    data = await res.json();
  } catch (err) {
    console.error(`[identity-warm] Qdrant scroll error: ${err.message}`);
    break;
  }

  const points = data.result?.points ?? [];
  if (points.length === 0) break;
  totalScrolled += points.length;
  offset = data.result?.next_page_offset ?? null;

  for (const pt of points) {
    const featureId = pt.payload?.feature_id ?? pt.payload?.featureId ?? null;

    // Extract raw path from any known payload field
    let rawPath = null;
    for (const f of PAYLOAD_FIELDS) {
      if (pt.payload?.[f]) { rawPath = pt.payload[f]; break; }
    }
    if (!rawPath && !featureId) continue;

    const canonical = rawPath ? normalizeSourceRef(rawPath) : null;
    const hash = canonical ? computeHash(canonical) : null;
    const ptId = String(pt.id);

    if (featureId) {
      if (!featureToPoints.has(featureId)) featureToPoints.set(featureId, new Set());
      featureToPoints.get(featureId).add(ptId);
      if (canonical) {
        if (!featureToRefs.has(featureId)) featureToRefs.set(featureId, new Set());
        featureToRefs.get(featureId).add(canonical);
      }
    }

    if (hash && canonical) {
      if (!hashToPoints.has(hash)) hashToPoints.set(hash, new Set());
      hashToPoints.get(hash).add(ptId);
      if (featureId) {
        if (!hashToFeatures.has(hash)) hashToFeatures.set(hash, new Set());
        hashToFeatures.get(hash).add(featureId);
      }
      totalMapped++;
    }
  }

  if (totalScrolled % 10000 === 0) {
    process.stdout.write(`  scrolled=${totalScrolled} featureIds=${featureToPoints.size} hashes=${hashToPoints.size}\r`);
  }
  if (offset === null) break;
}

console.log(`\n[identity-warm] Scrolled ${totalScrolled} points`);
console.log(`[identity-warm] featureIds found: ${featureToPoints.size}`);
console.log(`[identity-warm] canonicalSourceRef hashes: ${hashToPoints.size}`);
console.log(`[identity-warm] mapped points: ${totalMapped}`);

// ── Write to Valkey ───────────────────────────────────────────────────────────

if (!APPLY) {
  console.log('\n[identity-warm] DRY-RUN — would write:');
  console.log(`  feature:{id}:sourceRefs  — ${featureToRefs.size} keys`);
  console.log(`  feature:{id}:qdrantPoints — ${featureToPoints.size} keys`);
  console.log(`  sourceRef:{hash}:featureIds — ${hashToFeatures.size} keys`);
  console.log(`  sourceRef:{hash}:qdrantPoints — ${hashToPoints.size} keys`);
  console.log('[identity-warm] Re-run with --apply to populate Valkey.');
  await redis.quit().catch(() => {});
  process.exit(0);
}

let written = 0;
const pipe = redis.pipeline();

for (const [featureId, refs] of featureToRefs) {
  const key = `feature:${featureId}:sourceRefs`;
  pipe.del(key);
  for (const ref of refs) pipe.sadd(key, ref);
  pipe.expire(key, TTL);
  written++;
}

for (const [featureId, points] of featureToPoints) {
  const key = `feature:${featureId}:qdrantPoints`;
  pipe.del(key);
  for (const pt of points) pipe.sadd(key, pt);
  pipe.expire(key, TTL);
  written++;
}

for (const [hash, featureIds] of hashToFeatures) {
  const key = `sourceRef:${hash}:featureIds`;
  pipe.del(key);
  for (const fid of featureIds) pipe.sadd(key, fid);
  pipe.expire(key, TTL);
  written++;
}

for (const [hash, points] of hashToPoints) {
  const key = `sourceRef:${hash}:qdrantPoints`;
  pipe.del(key);
  for (const pt of points) pipe.sadd(key, pt);
  pipe.expire(key, TTL);
  written++;
}

await pipe.exec();
await redis.quit().catch(() => {});

console.log(`\n[identity-warm] Wrote ${written} Valkey key groups`);
console.log(`[identity-warm] TTL: ${TTL}s (${Math.round(TTL / 3600)}h)`);
console.log('[identity-warm] Done.');
