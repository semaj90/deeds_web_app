#!/usr/bin/env node
/**
 * seed-redis-reward-sets.mjs
 *
 * Seeds reward:zset:packet and reward:zset:feature from atlas_packets.reward_prior.
 * Run after backfill-reward-prior.mjs --apply to warm the Redis sorted sets
 * for reward-weighted K-means and XGBoost feature export.
 *
 * Usage:
 *   node scripts/atlas/seed-redis-reward-sets.mjs             # dry-run
 *   node scripts/atlas/seed-redis-reward-sets.mjs --apply
 */

import pg from 'pg';
import Redis from 'ioredis';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_HOST   = process.env.REDIS_HOST   || '127.0.0.1';
const REDIS_PORT   = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASS   = process.env.REDIS_PASSWORD || process.env.REDIS_PASS || 'redis';

const REWARD_ZSET_PACKET  = 'reward:zset:packet';
const REWARD_ZSET_FEATURE = 'reward:zset:feature';

async function main() {
  console.log(`\n═══ Seed Redis Reward Sets ${APPLY ? '(APPLY)' : '(dry-run)'} ═══\n`);

  const pool  = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });
  const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PASS,
    lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false, retryStrategy: () => null });
  redis.on('error', () => {});

  try {
    await redis.connect();
    await redis.ping();
    console.log('Redis: connected');
  } catch (err) {
    console.error('Redis not reachable:', err.message);
    await pool.end();
    redis.disconnect();
    process.exitCode = 1;
    return;
  }

  try {
    // Load all packets with reward_prior > 0
    const { rows } = await pool.query(`
      SELECT packet_key, feature_id, reward_prior
      FROM atlas_packets
      WHERE reward_prior > 0 AND packet_key IS NOT NULL
      ORDER BY reward_prior DESC
    `);
    console.log(`Packets with reward_prior > 0: ${rows.length}`);

    // Compute feature averages
    const featureMap = new Map();
    for (const r of rows) {
      if (r.feature_id) {
        const fid = r.feature_id;
        const existing = featureMap.get(fid) ?? { total: 0, count: 0 };
        existing.total += parseFloat(r.reward_prior);
        existing.count += 1;
        featureMap.set(fid, existing);
      }
    }
    console.log(`Features with reward signal: ${featureMap.size}`);

    if (!APPLY) {
      console.log('\nSample packets (top 5 by reward_prior):');
      rows.slice(0, 5).forEach(r =>
        console.log(`  ${r.packet_key.slice(0, 50).padEnd(50)} reward=${parseFloat(r.reward_prior).toFixed(4)}`)
      );
      console.log('\nSample features:');
      [...featureMap.entries()].slice(0, 5).forEach(([fid, {total, count}]) =>
        console.log(`  ${fid.padEnd(30)} avgReward=${(total/count).toFixed(4)} count=${count}`)
      );
      console.log('\n(dry-run — run with --apply to seed Redis)');
      return;
    }

    // Apply: pipeline ZADD in batches of 500
    const BATCH = 500;
    let seededPackets = 0;

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const pipeline = redis.pipeline();
      for (const r of batch) {
        pipeline.zadd(REWARD_ZSET_PACKET, parseFloat(r.reward_prior), r.packet_key);
      }
      await pipeline.exec();
      seededPackets += batch.length;
    }

    // Seed feature sorted set
    let seededFeatures = 0;
    const featurePipeline = redis.pipeline();
    for (const [fid, { total, count }] of featureMap.entries()) {
      featurePipeline.zadd(REWARD_ZSET_FEATURE, total / count, fid);
      seededFeatures++;
    }
    await featurePipeline.exec();

    // Verify
    const [packetSize, featureSize] = await Promise.all([
      redis.zcard(REWARD_ZSET_PACKET),
      redis.zcard(REWARD_ZSET_FEATURE),
    ]);

    console.log(`\n══ Result ══`);
    console.log(`  reward:zset:packet  → ${packetSize} entries`);
    console.log(`  reward:zset:feature → ${featureSize} entries`);

    // Show top 5 packets
    const top5 = await redis.zrevrangebyscore(REWARD_ZSET_PACKET, '+inf', '-inf', 'WITHSCORES', 'LIMIT', 0, 5);
    console.log('\nTop 5 packets by reward:');
    for (let i = 0; i < top5.length; i += 2) {
      console.log(`  ${top5[i].slice(0, 50).padEnd(50)} ${parseFloat(top5[i+1]).toFixed(4)}`);
    }

    const gatePass = packetSize > 0 && featureSize > 0;
    console.log(`\n  ${gatePass ? '✅ GATE PASS' : '⚠️  GATE FAIL'}`);

  } finally {
    await pool.end();
    await redis.quit().catch(() => {});
  }
}

main().catch(err => { console.error(err); process.exit(1); });
