#!/usr/bin/env node
/**
 * Phase 10: Packet Cache Warmer
 *
 * Runs after Phase 7 reaches ~50% completion (20K summaries).
 * Builds complete packet envelopes and caches to Redis (7-day TTL).
 *
 * Cache structure:
 *   bitfrost:packet:envelope:{id} → canonical packet shape (identity + summary + topology)
 *   bitfrost:packet:index:{feature_id} → set of packet IDs for feature clustering
 *   phase10:cache:warm:timestamp → last cache warm timestamp
 *
 * Daily execution (2 AM) ensures cache stays fresh.
 */

import pg from 'pg';
import Redis from 'ioredis';

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DATABASE_HOST || '127.0.0.1',
  port: parseInt(process.env.DATABASE_PORT || '5434'),
  user: process.env.DATABASE_USER || 'legal_admin',
  password: process.env.DATABASE_PASSWORD || '123456',
  database: process.env.DATABASE_NAME || 'legal_ai_db'
});

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || 'redis',
  lazyConnect: true,
  retryStrategy: () => null
});

const CACHE_TTL = parseInt(process.env.CACHE_TTL || '604800'); // 7 days

async function warmPacketCache() {
  const timestamp = new Date().toISOString();
  console.log(`\n🔥 Phase 10: Packet Cache Warmer [${timestamp}]\n`);

  try {
    await redis.connect();

    // 1. Fetch packets with summaries (Phase 7 requirement)
    const result = await pool.query(`
      SELECT
        id,
        relative_path as source_ref,
        symbol,
        qdrant_id,
        som_cluster,
        page_rank_score,
        community_id,
        summary,
        cluster_summary,
        tags
      FROM codebase_chunk_index
      WHERE summary IS NOT NULL AND summary != ''
      ORDER BY id
    `);

    const packets = result.rows;
    console.log(`  📦 Found ${packets.length} packets with summaries\n`);

    if (packets.length === 0) {
      console.log(`  ⚠️  No summaries yet. Skipping cache warm.\n`);
      await redis.quit();
      await pool.end();
      return;
    }

    // 2. Build and cache packet envelopes
    let cached = 0;
    const batchSize = 500;

    for (let i = 0; i < packets.length; i += batchSize) {
      const batch = packets.slice(i, i + batchSize);

      for (const pkt of batch) {
        const envelope = {
          packet_id: pkt.id,
          source_ref: pkt.source_ref,
          symbol: pkt.symbol,
          summary: pkt.summary,
          topology: {
            som_cluster: pkt.som_cluster,
            pagerank: pkt.page_rank_score,
            community_id: pkt.community_id
          },
          retrieval: {
            qdrant_id: pkt.qdrant_id,
            tags: pkt.tags || []
          },
          metadata: {
            cached_at: timestamp,
            cache_ttl: CACHE_TTL
          }
        };

        const key = `bitfrost:packet:envelope:${pkt.id}`;
        await redis.setex(key, CACHE_TTL, JSON.stringify(envelope));

        // Index by feature for faster retrieval
        if (pkt.symbol) {
          const indexKey = `bitfrost:packet:index:${pkt.symbol}`;
          await redis.sadd(indexKey, pkt.id);
          await redis.expire(indexKey, CACHE_TTL);
        }

        cached++;
      }

      if ((i + batchSize) % 2000 === 0) {
        console.log(`  ✓ Cached ${i + batchSize}/${packets.length} packets`);
      }
    }

    console.log(`\n  ✅ Cached ${cached} packet envelopes (7-day TTL)`);

    // 3. Record warm timestamp
    await redis.setex(
      `phase10:cache:warm:timestamp`,
      CACHE_TTL,
      timestamp
    );

    // 4. Report cache stats
    const keys = await redis.keys('bitfrost:packet:envelope:*');
    const indexKeys = await redis.keys('bitfrost:packet:index:*');

    console.log(`  📊 Cache stats:`);
    console.log(`     - Packet envelopes: ${keys.length}`);
    console.log(`     - Feature indexes: ${indexKeys.length}\n`);

  } catch (err) {
    console.error(`  ❌ Cache warm error: ${err.message}\n`);
  } finally {
    await redis.quit();
    await pool.end();
  }
}

warmPacketCache();
