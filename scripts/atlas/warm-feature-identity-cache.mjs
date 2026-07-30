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
import {
  resolveAtlasRedisContext,
  runRedisCli,
  shouldPreferValkeyCli,
} from '../../sveltekit-frontend/scripts/atlas/lib/redis-valkey.mjs';
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const _helperPath = resolve(__dirname, '../lib/canonical-source-ref.mjs');
const { normalizeSourceRef, sourceRefHash: computeHash } =
  await import(pathToFileURL(_helperPath).href);

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const SCROLL_LIMIT = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '0', 10) || 0;

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const COLLECTION = 'codebase_chunks_768';
const TTL = 24 * 3600; // 24h
const REPO_ROOT = resolve(__dirname, '../..');
const HLL_PREFIX = 'feature-identity:hll';

console.log(`[identity-warm] mode=${APPLY ? 'APPLY' : 'DRY-RUN'} limit=${SCROLL_LIMIT || 'none'}`);

// ── Redis ────────────────────────────────────────────────────────────────────

let redis;
try {
  const { env, container, password } = await resolveAtlasRedisContext(REPO_ROOT);
  const host = env.VALKEY_HOST || env.REDIS_HOST || '127.0.0.1';
  const port = parseInt(env.VALKEY_PORT || env.REDIS_PORT || '6379', 10);
  const redisUrl = env.VALKEY_URL || env.REDIS_URL || `redis://${host}:${port}`;
  const preferCli = shouldPreferValkeyCli(env, container);
  redis = preferCli
    ? {
        async connect() {},
        async ping() {
          const result = runRedisCli(container, ['PING'], password);
          if (!result.ok) throw new Error(result.stderr || result.error || 'redis-cli PING failed');
          return result.stdout.trim();
        },
        async setex(key, ttl, value) {
          const result = runRedisCli(container, ['SETEX', key, String(ttl), value], password);
          if (!result.ok) throw new Error(result.stderr || result.error || 'redis-cli SETEX failed');
        },
        async sadd(key, ...members) {
          const result = runRedisCli(container, ['SADD', key, ...members], password);
          if (!result.ok) throw new Error(result.stderr || result.error || 'redis-cli SADD failed');
        },
        async pfadd(key, ...members) {
          const result = runRedisCli(container, ['PFADD', key, ...members], password);
          if (!result.ok) throw new Error(result.stderr || result.error || 'redis-cli PFADD failed');
        },
        async pfcount(key) {
          const result = runRedisCli(container, ['PFCOUNT', key], password);
          if (!result.ok) throw new Error(result.stderr || result.error || 'redis-cli PFCOUNT failed');
          return Number.parseInt(result.stdout.trim() || '0', 10) || 0;
        },
        async quit() {},
      }
    : new Redis({
        host,
        port,
        password,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: () => null,
      });
  if (!preferCli) redis.on('error', () => {});
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
  console.log(`  ${HLL_PREFIX}:featureIds`);
  console.log(`  ${HLL_PREFIX}:sourceRefs`);
  console.log('[identity-warm] Re-run with --apply to populate Valkey.');
  await redis.quit().catch(() => {});
  process.exit(0);
}

let written = 0;

for (const [featureId, refs] of featureToRefs) {
  const key = `feature:${featureId}:sourceRefs`;
  await redis.setex(key, TTL, JSON.stringify([...refs]));
  if (typeof redis.pfadd === 'function') await redis.pfadd(`${HLL_PREFIX}:featureIds`, featureId);
  written++;
}

for (const [featureId, points] of featureToPoints) {
  const key = `feature:${featureId}:qdrantPoints`;
  await redis.setex(key, TTL, JSON.stringify([...points]));
  written++;
}

for (const [hash, featureIds] of hashToFeatures) {
  const key = `sourceRef:${hash}:featureIds`;
  await redis.setex(key, TTL, JSON.stringify([...featureIds]));
  if (typeof redis.pfadd === 'function') await redis.pfadd(`${HLL_PREFIX}:sourceRefs`, hash);
  written++;
}

for (const [hash, points] of hashToPoints) {
  const key = `sourceRef:${hash}:qdrantPoints`;
  await redis.setex(key, TTL, JSON.stringify([...points]));
  written++;
}

if (typeof redis.pfcount === 'function') {
  console.log(`[identity-warm] HLL feature count: ${await redis.pfcount(`${HLL_PREFIX}:featureIds`)}`);
  console.log(`[identity-warm] HLL sourceRef count: ${await redis.pfcount(`${HLL_PREFIX}:sourceRefs`)}`);
}
await redis.quit().catch(() => {});

console.log(`\n[identity-warm] Wrote ${written} Valkey key groups`);
console.log(`[identity-warm] TTL: ${TTL}s (${Math.round(TTL / 3600)}h)`);
console.log('[identity-warm] Done.');
