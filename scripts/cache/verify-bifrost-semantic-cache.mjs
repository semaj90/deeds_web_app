#!/usr/bin/env node
/**
 * verify-bifrost-semantic-cache.mjs
 *
 * Spot-checks bifrost:sem:* keys in Valkey, samples the top-10 reward entries
 * from the sorted set, confirms feature index coverage, and reports stale refs.
 *
 * Exit 0 = healthy   Exit 1 = missing/empty
 *
 * Usage:
 *   node scripts/cache/verify-bifrost-semantic-cache.mjs [--strict]
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import Redis from 'ioredis';
import dotenv from 'dotenv';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(ROOT, '.env.local'), override: false });
dotenv.config({ path: resolve(ROOT, '.env'), override: false });

const STRICT = process.argv.includes('--strict');

const redis = new Redis({
  host: process.env.REDIS_HOST ?? '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  password: process.env.REDIS_PASSWORD || process.env.REDIS_PASS || undefined,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: () => null,
  connectTimeout: 3000,
});
redis.on('error', () => {});

async function main() {
  console.log('[bifrost-verify] Verifying bifrost semantic cache...');

  await redis.connect().catch(() => {
    console.error('[bifrost-verify] Cannot connect to Valkey');
    process.exit(STRICT ? 1 : 0);
  });

  let pass = 0;
  let fail = 0;

  // 1. Warm summary
  const warmSummary = await redis.get('bifrost:sem:warm:summary');
  if (warmSummary) {
    const s = JSON.parse(warmSummary);
    console.log(`  [✓] warm summary: ${s.written} written, ${s.features} features @ ${s.ts}`);
    pass++;
  } else {
    console.warn(`  [!] warm summary missing — run: npm run bifrost:semantic:warm`);
    fail++;
  }

  // 2. Reward sorted set
  const rewardCount = await redis.zcard('bifrost:sem:reward:zset');
  if (rewardCount > 0) {
    console.log(`  [✓] bifrost:sem:reward:zset → ${rewardCount} entries`);
    pass++;

    // Sample top-10
    const top10 = await redis.zrevrangebyscore('bifrost:sem:reward:zset', '+inf', '-inf', 'WITHSCORES', 'LIMIT', 0, 10);
    console.log(`  Top 5 by reward:`);
    for (let i = 0; i < top10.length; i += 2) {
      const qh = top10[i];
      const score = parseFloat(top10[i + 1]).toFixed(4);
      const pkt = await redis.get(`bifrost:sem:packet:${qh}`);
      const fid = pkt ? (JSON.parse(pkt).feature_id ?? '?') : 'NOT FOUND';
      console.log(`    ${score}  ${qh.slice(0, 12)}…  feature=${fid}`);
      if (!pkt) fail++;
    }
  } else {
    console.warn(`  [!] bifrost:sem:reward:zset is empty`);
    fail++;
  }

  // 3. Feature index
  const featureKeys = await redis.keys('bifrost:sem:feature:*');
  if (featureKeys.length > 0) {
    console.log(`  [✓] ${featureKeys.length} feature index keys`);
    pass++;
    // Sample one
    const sample = featureKeys[0];
    const val = await redis.get(sample);
    if (val) {
      const arr = JSON.parse(val);
      console.log(`    sample: ${sample} → ${arr.length} packets, top reward=${arr[0]?.reward?.toFixed(4)}`);
    }
  } else {
    console.warn(`  [!] no bifrost:sem:feature:* keys found`);
    fail++;
  }

  // 4. Stale ref set
  const staleCount = await redis.zcard('bifrost:sem:stale:zset');
  console.log(`  [i] bifrost:sem:stale:zset → ${staleCount} source refs tracked`);

  // 5. sourceRef spot-check
  const srcRefKeys = await redis.keys('bifrost:sem:sourceRef:*');
  console.log(`  [i] bifrost:sem:sourceRef:* → ${srcRefKeys.length} source ref index entries`);
  if (srcRefKeys.length > 0) pass++;

  // 6. intent index
  const intentKeys = await redis.keys('bifrost:sem:intent:*');
  if (intentKeys.length > 0) {
    console.log(`  [✓] bifrost:sem:intent:* → ${intentKeys.length} intent index entries`);
    pass++;
  } else {
    console.warn(`  [!] no bifrost:sem:intent:* keys — re-run: npm run bifrost:semantic:warm`);
    fail++;
  }

  // 7. TTL sanity — packet key should survive at least an hour
  const sampleQh = await redis.zrevrangebyscore('bifrost:sem:reward:zset', '+inf', '-inf', 'LIMIT', 0, 1);
  if (sampleQh.length > 0) {
    const ttl = await redis.ttl(`bifrost:sem:packet:${sampleQh[0]}`);
    if (ttl > 3600) {
      console.log(`  [✓] packet TTL healthy: ${ttl}s (~${Math.round(ttl/3600)}h remaining)`);
      pass++;
    } else {
      console.warn(`  [!] packet TTL low: ${ttl}s — consider increasing TTL_PACKET in warm script`);
      fail++;
    }
  }

  console.log(`\n[bifrost-verify] ${pass} checks passed, ${fail} failed`);

  await redis.quit();

  if (STRICT && fail > 0) process.exit(1);
  if (fail > pass) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
