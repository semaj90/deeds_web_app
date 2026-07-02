#!/usr/bin/env node
import Redis from 'ioredis';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, '../../docs/reports');

function hashQuery(query) {
  return crypto.createHash('sha256').update(query).digest('hex').slice(0, 8);
}

async function main() {
  const startTime = Date.now();
  console.log('\n💾 Phase 102 Step 6: Redis Cache Writer\n');

  const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || 'redis',
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null,
    maxRetriesPerRequest: 1
  });

  const pgClient = new pg.Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5434'),
    user: process.env.DB_USER || 'legal_admin',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'legal_ai_db'
  });

  let redisReady = false;
  try {
    // Try to connect to Redis
    try {
      await redis.connect();
      // Verify connection with PING
      await redis.ping();
      redisReady = true;
      console.log('✅ Connected to Redis/Valkey\n');
    } catch (e) {
      console.log(`⚠️  Redis/Valkey unavailable: ${e.message}\n`);
    }

    await pgClient.connect();
    console.log('✅ Connected to Postgres\n');

    let cachedCount = 0;

    console.log('🔄 Caching global top-10 RRF results:\n');

    // Get top-10 RRF scores globally (not grouped by query yet)
    try {
      const result = await pgClient.query(`
        SELECT
          packet_id,
          packet_key,
          source_ref,
          feature_id,
          feature_label,
          (metadata->'rrf') AS rrf
        FROM atlas_packets
        WHERE metadata ? 'rrf'
        ORDER BY ((metadata->'rrf'->>'score')::double precision) DESC
        LIMIT 10
      `);

      const topResults = result.rows;

      if (topResults.length > 0) {
        console.log(`  📊 Found ${topResults.length} top RRF scores\n`);

        // Cache global top-10 as single key
        const cacheKey = 'bitfrost:rrf:global:top-10';

        if (redisReady) {
          try {
            const cacheData = JSON.stringify(topResults);
            await redis.setex(cacheKey, 3600, cacheData);
            console.log(`  ✅ Global top-10: Cached ${topResults.length} results`);
            console.log(`  📌 Cache key: ${cacheKey}`);
            console.log(`  ⏳ Per-query keys (bitfrost:rrf:{query_hash}:top-10) deferred until scorer stores all query groups\n`);
            cachedCount = topResults.length;
          } catch (e) {
            console.log(`  ❌ Cache write failed: ${e.message}`);
          }
        } else {
          console.log(`  ⚠️  Redis unavailable, skipped cache\n`);
        }
      } else {
        console.log('  ⚠️  No RRF scores found in atlas_packets.metadata\n');
      }
    } catch (e) {
      console.log(`  ❌ Error fetching RRF scores: ${e.message}`);
    }

    console.log(`\n📊 Cache Stats:`);
    console.log(`  Total results cached: ${cachedCount}`);
    console.log(`  Redis ready: ${redisReady}`);
    console.log(`  Cache TTL: 3600 seconds (1 hour)`);

    if (redisReady) {
      try {
        const dbSize = await redis.dbsize();
        console.log(`  Redis total keys: ${dbSize}`);
      } catch (e) {
        console.log(`  ⚠️  Could not get Redis key count: ${e.message}`);
      }
    }

    console.log(`\n✅ COMPLETE in ${Date.now() - startTime}ms\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (redis.isOpen) {
      await redis.quit();
    }
    await pgClient.end();
  }
}

await main();
