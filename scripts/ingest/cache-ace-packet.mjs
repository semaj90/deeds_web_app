#!/usr/bin/env node
/**
 * cache-ace-packet.mjs
 *
 * Reads the ACE packet from .opencode/ace-packet.json (output of compress-cards.mjs)
 * and stores it in Redis/Valkey with intent-hash keying and configurable TTL.
 *
 * Cache policy (Phase 11E):
 *   - Active repair (errors/blocked): 1 day TTL
 *   - Hot sourceRefs / feature labels: 7 days TTL
 *   - Standard ACE packet: 1–7 days TTL (default 1 day)
 *   - Weekly cold-storage summary: 30+ days TTL
 *
 * Cache keys:
 *   ace:packet:{intentHash}          → full packet JSON (string, compressed)
 *   ace:packet:latest                → most-recent packet JSON (convenience alias)
 *   ace:packet:meta:{intentHash}     → metadata hash (query, tokenEstimate, cardCount, ttl)
 *   ace:intent:{intentHash}:sourceRefs → JSON array of sourceRefs in this packet
 *
 * Usage:
 *   node scripts/ingest/cache-ace-packet.mjs
 *   node scripts/ingest/cache-ace-packet.mjs --ttl 86400     # 1 day
 *   node scripts/ingest/cache-ace-packet.mjs --ttl 604800    # 7 days
 *   node scripts/ingest/cache-ace-packet.mjs --dry-run
 *   node scripts/ingest/cache-ace-packet.mjs --audit         # read+print cached metadata
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

// ioredis — same cold-start guard used in other pipeline scripts
import Redis from 'ioredis';

const ROOT       = process.cwd();
const OUT_DIR    = path.join(ROOT, '.opencode');
const PACKET_IN  = path.join(OUT_DIR, 'ace-packet.json');

const args       = process.argv.slice(2);
const DRY_RUN    = args.includes('--dry-run');
const AUDIT      = args.includes('--audit');
const ttlIdx     = args.indexOf('--ttl');
const TTL_SECS   = ttlIdx >= 0 ? parseInt(args[ttlIdx + 1], 10) : 86400; // default 1 day

// Redis config — match sveltekit-frontend env defaults.
const REDIS_URL = process.env.REDIS_URL || process.env.VALKEY_URL || 'redis://127.0.0.1:6379';
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || process.env.VALKEY_PASSWORD || 'redis';

function intentHash(query) {
  return crypto.createHash('sha1').update((query || '').toLowerCase().trim()).digest('hex').slice(0, 16);
}

function fmt(n) {
  return Number.isFinite(Number(n)) ? Number(n).toFixed(4) : '0.0000';
}

// Valkey is Redis-compatible, so ioredis is fine.

// ── Redis/Valkey cold-start safe connect ─────────────────────────────────────
async function connectRedis() {
  const redis = new Redis(REDIS_URL, {
    password: REDIS_PASSWORD,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });

  redis.on('error', () => {});

  try {
    await redis.connect();
    await redis.ping();
    return redis;
  } catch {
    return null;
  }
}

// ── Audit mode: read cached metadata ─────────────────────────────────────────
async function auditMode(redis) {
  console.log('\n── ACE Packet Cache Audit ─────────────────────────────────');
  if (!redis) {
    console.log('  ❌ Redis unavailable');
    return;
  }
  const latestRaw = await redis.get('ace:packet:latest');
  if (!latestRaw) {
    console.log('  ace:packet:latest — not found');
    return;
  }
  const latest = JSON.parse(latestRaw);
  const ih = intentHash(latest.query || '');
  console.log(`  query      : "${latest.query}"`);
  console.log(`  intentHash : ${ih}`);
  console.log(`  cards      : ${latest.totalCards}`);
  console.log(`  tokens     : ~${latest.tokenEstimate}`);
  console.log(`  generated  : ${latest.generatedAt}`);

  const meta = await redis.hgetall(`ace:packet:meta:${ih}`);
  if (meta && Object.keys(meta).length) {
    console.log(`  meta.ttl   : ${meta.ttl}s`);
    console.log(`  meta.cachedAt: ${meta.cachedAt}`);
  }
  const srcRaw = await redis.get(`ace:intent:${ih}:sourceRefs`);
  if (srcRaw) {
    const srcs = JSON.parse(srcRaw);
    console.log(`  sourceRefs : ${srcs.length} entries (first 5: ${srcs.slice(0,5).join(', ')})`);
  }
  console.log('──────────────────────────────────────────────────────────\n');
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  if (!AUDIT) {
    console.log('\n── Cache ACE Packet ──────────────────────────────────────');
    console.log(`  ttl    : ${TTL_SECS}s (~${(TTL_SECS/3600).toFixed(1)}h)${DRY_RUN ? '  [dry-run]' : ''}`);
  }

  // Connect Redis
  const redis = await connectRedis();
  if (AUDIT) {
    await auditMode(redis);
    if (redis) redis.disconnect();
    return;
  }

  console.log(`  redis  : ${redis ? '✅ connected' : '⚠️  unavailable — will write .tmp/ace-packet-cache-manifest.json only'}`);

  // Load packet
  let packet;
  try {
    packet = JSON.parse(await fs.readFile(PACKET_IN, 'utf8'));
  } catch {
    console.error(`❌ ${PACKET_IN} not found — run compress-cards.mjs first`);
    process.exit(1);
  }

  const { query, tokenEstimate, totalCards, cards, sourceRefs } = packet;
  console.log(`  query  : "${query}"`);
  console.log(`  cards  : ${totalCards} | ~${tokenEstimate} tokens`);

  const ih = intentHash(query);
  console.log(`  intent : ${ih}`);

  // Build sourceRefs array for intent key
  const sourceRefList = Object.values(sourceRefs || {}).filter(Boolean);
  console.log(`  srefs  : ${sourceRefList.length}`);

  const packetJson   = JSON.stringify(packet);
  const metaPayload  = {
    query,
    intentHash:    ih,
    tokenEstimate: String(tokenEstimate),
    cardCount:     String(totalCards),
    ttl:           String(TTL_SECS),
    cachedAt:      new Date().toISOString(),
  };
  const sourceRefsJson = JSON.stringify(sourceRefList);

  if (DRY_RUN) {
    console.log(`\n  dry-run: would SET ace:packet:${ih}  (${(packetJson.length/1024).toFixed(1)}KB, TTL ${TTL_SECS}s)`);
    console.log(`  dry-run: would SET ace:packet:latest`);
    console.log(`  dry-run: would HSET ace:packet:meta:${ih}`);
    console.log(`  dry-run: would SET ace:intent:${ih}:sourceRefs`);
    console.log('──────────────────────────────────────────────────────────\n');
    if (redis) redis.disconnect();
    return;
  }

  // Write to Redis
  if (redis) {
    const pipeline = redis.pipeline();
    pipeline.setex(`ace:packet:${ih}`,            TTL_SECS, packetJson);
    pipeline.setex('ace:packet:latest',            TTL_SECS, packetJson);
    pipeline.hset(`ace:packet:meta:${ih}`,        metaPayload);
    pipeline.expire(`ace:packet:meta:${ih}`,       TTL_SECS);
    pipeline.setex(`ace:intent:${ih}:sourceRefs`, TTL_SECS, sourceRefsJson);
    await pipeline.exec();
    console.log(`\n  ✅ ace:packet:${ih} SET  (TTL ${TTL_SECS}s)`);
    console.log(`  ✅ ace:packet:latest SET`);
    console.log(`  ✅ ace:packet:meta:${ih} HSET`);
    console.log(`  ✅ ace:intent:${ih}:sourceRefs SET`);
  }

  // Always write a local manifest (even when Redis is down)
  const manifestPath = path.join(ROOT, '.tmp', 'ace-packet-cache-manifest.json');
  const manifest = {
    cachedAt:    new Date().toISOString(),
    query,
    intentHash:  ih,
    tokenEstimate,
    totalCards,
    ttlSeconds:  TTL_SECS,
    redisKeys: [
      `ace:packet:${ih}`,
      'ace:packet:latest',
      `ace:packet:meta:${ih}`,
      `ace:intent:${ih}:sourceRefs`,
    ],
    packetSizeBytes: packetJson.length,
    sourceRefCount:  sourceRefList.length,
  };
  await fs.mkdir(path.join(ROOT, '.tmp'), { recursive: true });
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`  ✅ wrote ${manifestPath}`);

  console.log('──────────────────────────────────────────────────────────\n');
  if (redis) redis.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
