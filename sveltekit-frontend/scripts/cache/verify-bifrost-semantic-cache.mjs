#!/usr/bin/env node
/**
 * verify-bifrost-semantic-cache.mjs
 *
 * Smoke-verifies the bifrost:sem:* Valkey key layout after warming.
 *
 * Gates:
 *   G1 — at least 1 bifrost:sem:packet:* key exists
 *   G2 — bifrost:sem:reward:zset has entries
 *   G3 — bifrost:sem:stale:zset has entries
 *   G4 — a sampled packet round-trips (parse + field presence)
 *   G5 — feature pointer resolves to a packet key
 *   G6 — sourceRef pointer resolves to a packet key
 *
 * Usage:
 *   node scripts/cache/verify-bifrost-semantic-cache.mjs
 *   node scripts/cache/verify-bifrost-semantic-cache.mjs --verbose
 */

import { createHash } from 'node:crypto';
import Redis from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST ?? '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT ?? '6379', 10);
const REDIS_PASS = process.env.REDIS_PASSWORD ?? process.env.REDIS_PASS ?? 'redis';
const VERBOSE    = process.argv.includes('--verbose');

function sha256(s) {
  return createHash('sha256').update(s).digest('hex');
}

let pass = 0, fail = 0;

function ok(gate, msg) { console.log(`✅ Gate ${gate}: ${msg}`); pass++; }
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

// G3: stale zset
const staleCard = await redis.zcard('bifrost:sem:stale:zset');
if (VERBOSE) console.log(`   stale:zset cardinality: ${staleCard}`);
if (staleCard > 0) {
  ok(3, `bifrost:sem:stale:zset has ${staleCard} entries`);
} else {
  err(3, 'bifrost:sem:stale:zset is empty');
}

// G4: sample packet round-trip
let samplePacket = null;
if (packetKeys.length > 0) {
  const raw = await redis.get(packetKeys[0]);
  try {
    samplePacket = JSON.parse(raw ?? '{}');
    const required = ['query_hash', 'feature_id', 'source_refs', 'reward', 'confidence'];
    const missing = required.filter(k => samplePacket[k] === undefined);
    if (missing.length === 0) {
      ok(4, `packet round-trip OK (reward=${samplePacket.reward}, confidence=${samplePacket.confidence})`);
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

// G5: feature pointer resolves
if (samplePacket?.feature_id) {
  const featureHash = await redis.get(`bifrost:sem:feature:${samplePacket.feature_id}`);
  if (featureHash) {
    const linked = await redis.exists(`bifrost:sem:packet:${featureHash}`);
    if (linked) {
      ok(5, `feature pointer resolves → packet (feature_id=${samplePacket.feature_id})`);
    } else {
      err(5, 'feature pointer hash has no packet key', `hash=${featureHash}`);
    }
  } else {
    err(5, `feature pointer missing for feature_id=${samplePacket.feature_id}`);
  }
} else {
  console.log('⏭️  Gate 5: skipped (no feature_id in sample)');
}

// G6: sourceRef pointer resolves
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
  console.log('⏭️  Gate 6: skipped (no source_refs in sample)');
}

await redis.quit();
console.log(`\n── Verify: PASS=${pass} FAIL=${fail} ──`);
if (fail > 0) { process.exitCode = 1; }
else { console.log('✅ All bifrost semantic cache gates passed'); }
