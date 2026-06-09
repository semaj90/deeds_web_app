#!/usr/bin/env node
/**
 * verify-bifrost-semantic-cache.mjs
 *
 * Smoke-verifies the bifrost:sem:* Valkey key layout after warming.
 *
 * Gates:
 *   G1 — at least 1 bifrost:sem:packet:* key exists
 *   G2 — bifrost:sem:reward:zset has entries
 *   G3 — bifrost:sem:stale:zset (informational — may be empty if no sourceRef edges matched)
 *   G4 — a sampled packet round-trips (parse + field presence)
 *   G5 — feature index resolves to an array of packets with correct feature_id
 *   G6 — sourceRef pointer resolves to a packet key (skipped if no source_refs)
 *   G7 — intent index keys exist
 *   G8 — packet TTL is healthy (>1h remaining)
 *
 * Usage:
 *   node scripts/cache/verify-bifrost-semantic-cache.mjs
 *   node scripts/cache/verify-bifrost-semantic-cache.mjs --verbose
 *   node scripts/cache/verify-bifrost-semantic-cache.mjs --strict
 */

import { createHash } from 'node:crypto';
import Redis from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST ?? '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT ?? '6379', 10);
const REDIS_PASS = process.env.REDIS_PASSWORD ?? process.env.REDIS_PASS ?? 'redis';
const VERBOSE    = process.argv.includes('--verbose');
const STRICT     = process.argv.includes('--strict');

function sha256(s) {
  return createHash('sha256').update(s).digest('hex');
}

let pass = 0, fail = 0;

function ok(gate, msg) { console.log(`✅ Gate ${gate}: ${msg}`); pass++; }
function info(gate, msg) { console.log(`ℹ️  Gate ${gate}: ${msg}`); }
function err(gate, msg, detail = '') {
  console.error(`❌ Gate ${gate}: ${msg}${detail ? ' — ' + detail : ''}`);
  fail++;
}

const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASS || undefined,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: () => null,
});
redis.on('error', () => {});
await redis.connect();

// G1: packet keys exist
const packetStream = redis.scanStream({ match: 'bifrost:sem:packet:*', count: 10 });
const packetKeys = [];
for await (const batch of packetStream) {
  packetKeys.push(...batch);
  if (packetKeys.length >= 1) break;
}
if (packetKeys.length > 0) {
  ok(1, `bifrost:sem:packet:* keys found (${packetKeys.length} sampled)`);
} else {
  err(1, 'no bifrost:sem:packet:* keys — run bifrost:semantic:warm first');
}

// G2: reward zset
const rewardCard = await redis.zcard('bifrost:sem:reward:zset');
if (VERBOSE) console.log(`   reward:zset cardinality: ${rewardCard}`);
if (rewardCard > 0) {
  ok(2, `bifrost:sem:reward:zset has ${rewardCard} entries`);
} else {
  err(2, 'bifrost:sem:reward:zset is empty');
}

// G3: stale zset (informational — empty is expected when no sourceRef edges matched in DuckDB join)
const staleCard = await redis.zcard('bifrost:sem:stale:zset');
if (VERBOSE) console.log(`   stale:zset cardinality: ${staleCard}`);
info(3, `bifrost:sem:stale:zset has ${staleCard} entries (0 is OK — no sourceRef edges in DuckDB join yet)`);

// G4: sample packet round-trip
// Note: query_hash is the KEY suffix, not stored in the packet value
let samplePacket = null;
if (packetKeys.length > 0) {
  const raw = await redis.get(packetKeys[0]);
  try {
    samplePacket = JSON.parse(raw ?? '{}');
    const required = ['packet_uuid', 'feature_id', 'source_refs', 'reward', 'confidence', 'created_at'];
    const missing = required.filter(k => samplePacket[k] === undefined);
    if (missing.length === 0) {
      ok(4, `packet round-trip OK (reward=${samplePacket.reward}, feature_id=${samplePacket.feature_id})`);
    } else {
      err(4, `packet missing fields: ${missing.join(', ')}`);
    }
    if (VERBOSE) console.log('   sample packet:', JSON.stringify(samplePacket).slice(0, 200));
  } catch (e) {
    err(4, 'packet JSON parse failed', e.message);
  }
} else {
  console.log('⏭️  Gate 4: skipped (no packet keys)');
}

// G5: feature index resolves to packet array
// bifrost:sem:feature:{feature_id} stores a JSON array of top-10 full packet objects
if (samplePacket?.feature_id) {
  const featureRaw = await redis.get(`bifrost:sem:feature:${samplePacket.feature_id}`);
  if (featureRaw) {
    try {
      const arr = JSON.parse(featureRaw);
      if (Array.isArray(arr) && arr.length > 0 && arr[0]?.packet_uuid) {
        ok(5, `feature index resolves → ${arr.length} packets (feature_id=${samplePacket.feature_id}, top reward=${arr[0]?.reward})`);
      } else {
        err(5, 'feature index is not a packet array', `value=${featureRaw.slice(0, 100)}`);
      }
    } catch (e) {
      err(5, 'feature index JSON parse failed', e.message);
    }
  } else {
    err(5, `feature index key missing for feature_id=${samplePacket.feature_id}`);
  }
} else {
  console.log('⏭️  Gate 5: skipped (no feature_id in sample)');
}

// G6: sourceRef pointer resolves (skip if no source_refs — expected until DuckDB sourceRef edges land)
if (samplePacket?.source_refs?.[0]) {
  const ref = samplePacket.source_refs[0];
  const refHash = sha256(ref);
  const refPointer = await redis.get(`bifrost:sem:sourceRef:${refHash}`);
  if (refPointer) {
    const linked = await redis.exists(`bifrost:sem:packet:${refPointer}`);
    if (linked) {
      ok(6, `sourceRef pointer resolves → packet`);
    } else {
      err(6, 'sourceRef pointer has no packet key');
    }
  } else {
    err(6, `sourceRef pointer missing for ref=${ref}`);
  }
} else {
  console.log('⏭️  Gate 6: skipped (no source_refs in sample — expected until USES_DB edges land)');
}

// G7: intent index keys exist
const intentKeys = [];
const intentStream = redis.scanStream({ match: 'bifrost:sem:intent:*', count: 50 });
for await (const batch of intentStream) { intentKeys.push(...batch); if (intentKeys.length >= 1) break; }
if (intentKeys.length > 0) {
  const totalIntent = await redis.keys('bifrost:sem:intent:*');
  ok(7, `bifrost:sem:intent:* has ${totalIntent.length} keys`);
} else {
  err(7, 'no bifrost:sem:intent:* keys — re-run: npm run bifrost:semantic:warm');
}

// G8: TTL sanity — packet key should survive at least 1h
if (packetKeys.length > 0) {
  const ttl = await redis.ttl(packetKeys[0]);
  if (ttl > 3600) {
    ok(8, `packet TTL healthy: ${ttl}s (~${Math.round(ttl / 3600)}h remaining)`);
  } else if (ttl === -1) {
    err(8, 'packet key has no TTL (persistent) — warmer should set TTL_PACKET=86400');
  } else {
    err(8, `packet TTL low: ${ttl}s — re-warm to reset TTL`);
  }
} else {
  console.log('⏭️  Gate 8: skipped (no packet keys)');
}

await redis.quit();
console.log(`\n── Verify: PASS=${pass} FAIL=${fail} ──`);
if (fail === 0) {
  console.log('✅ All bifrost semantic cache gates passed');
} else if (STRICT) {
  process.exitCode = 1;
} else if (fail > pass) {
  process.exitCode = 1;
}
