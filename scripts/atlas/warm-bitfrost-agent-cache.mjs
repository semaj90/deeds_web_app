#!/usr/bin/env node
/**
 * Warm BitFrost Agent Cache
 *
 * Purpose: Pre-populate Valkey (Redis) with agent ownership metadata
 * before HyperRAG retrieval and GPU work.
 *
 * Keys warmed:
 *   bitfrost:agent:task:{task_id}
 *   bitfrost:agent:story:{story_id}
 *   bitfrost:packet:{packet_key}
 *   bitfrost:feature:{feature_id}
 *   bitfrost:source:{source_ref}
 *
 * TTL:
 *   CLAIMED      24h
 *   VERIFYING    24h
 *   PASS         7d
 *   SUPERSEDED   30d
 */

import pg from 'pg';
import redis from 'ioredis';

const DB_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const pool = new pg.Pool({ connectionString: DB_URL });
const cache = new redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });

const TTL = {
  CLAIMED: 24 * 60 * 60,      // 24h
  VERIFYING: 24 * 60 * 60,    // 24h
  PASS: 7 * 24 * 60 * 60,     // 7d
  SUPERSEDED: 30 * 24 * 60 * 60,  // 30d
};

function getTTL(status) {
  return TTL[status] || TTL.CLAIMED;
}

async function warmAgentCache() {
  console.log('🔥 Warming BitFrost Agent Cache...\n');

  await cache.connect();

  try {
    const result = await pool.query(`
      SELECT
        id,
        task_id,
        story_id,
        agent,
        trace_id,
        run_id,
        packet_key,
        source_ref,
        feature_id,
        cache_namespace,
        retrieval_strategy,
        gpu_eligible,
        status,
        metadata
      FROM agent_memory_registry
      WHERE status IN ('CLAIMED', 'VERIFYING', 'PASS', 'SUPERSEDED')
      ORDER BY created_at DESC
      LIMIT 10000
    `);

    const rows = result.rows;
    console.log(`📊 Found ${rows.length} agent registry entries to warm\n`);

    let warmed = 0;

    for (const row of rows) {
      const ttl = getTTL(row.status);
      const entry = {
        owner: row.agent,
        trace_id: row.trace_id,
        status: row.status,
        retrieval_strategy: row.retrieval_strategy,
        packet_key: row.packet_key,
        gpu_eligible: row.gpu_eligible,
        cached_at: new Date().toISOString(),
      };

      // bitfrost:agent:task:{task_id}
      if (row.task_id) {
        await cache.setex(
          `bitfrost:agent:task:${row.task_id}`,
          ttl,
          JSON.stringify(entry)
        );
        warmed++;
      }

      // bitfrost:agent:story:{story_id}
      if (row.story_id) {
        await cache.setex(
          `bitfrost:agent:story:${row.story_id}`,
          ttl,
          JSON.stringify(entry)
        );
        warmed++;
      }

      // bitfrost:packet:{packet_key}
      if (row.packet_key) {
        await cache.setex(
          `bitfrost:packet:${row.packet_key}`,
          ttl,
          JSON.stringify(entry)
        );
        warmed++;
      }

      // bitfrost:feature:{feature_id}
      if (row.feature_id) {
        await cache.setex(
          `bitfrost:feature:${row.feature_id}`,
          ttl,
          JSON.stringify(entry)
        );
        warmed++;
      }

      // bitfrost:source:{source_ref}
      if (row.source_ref) {
        await cache.setex(
          `bitfrost:source:${row.source_ref}`,
          ttl,
          JSON.stringify(entry)
        );
        warmed++;
      }
    }

    console.log(`\n✅ Warmed ${warmed} BitFrost cache entries\n`);
    console.log(`Cache Keys Pattern:`);
    console.log(`  bitfrost:agent:task:<task_id>`);
    console.log(`  bitfrost:agent:story:<story_id>`);
    console.log(`  bitfrost:packet:<packet_key>`);
    console.log(`  bitfrost:feature:<feature_id>`);
    console.log(`  bitfrost:source:<source_ref>\n`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Error warming cache:', err.message);
    process.exit(1);
  } finally {
    await cache.quit();
    await pool.end();
  }
}

warmAgentCache();
