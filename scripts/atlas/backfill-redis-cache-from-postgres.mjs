#!/usr/bin/env node
/**
 * backfill-redis-cache-from-postgres.mjs
 *
 * Backfill Redis/BitFrost cache from Postgres canonical packets.
 * Minimal: packet_key, feature_id, source_ref, qdrant_point_id only.
 *
 * Usage:
 *   node scripts/atlas/backfill-redis-cache-from-postgres.mjs --apply [--limit=5000]
 */

import pg from 'pg';
import Redis from 'ioredis';

const APPLY = process.argv.includes('--apply');
const LIMIT = parseInt(
  process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '5000',
  10
);
const VERBOSE = process.argv.includes('--verbose');

const PG_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASS = process.env.REDIS_PASSWORD || 'redis';

function log(...args) { console.log(...args); }
function vlog(...args) { if (VERBOSE) console.log(...args); }

async function main() {
  log('\n🔄 Backfill Redis/BitFrost from Postgres\n');
  log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  log(`Limit: ${LIMIT}\n`);

  const pool = new pg.Pool({ connectionString: PG_URL, max: 5 });
  const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PASS });

  let cached = 0;
  const startTime = Date.now();

  try {
    const result = await pool.query(`
      SELECT packet_key, feature_id, source_ref, qdrant_point_id
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
      LIMIT $1
    `, [LIMIT]);

    const packets = result.rows || result;
    log(`Caching ${packets.length} packets to Redis\n`);

    for (const p of packets) {
      try {
        if (APPLY) {
          const key = `bifrost:packet:${p.packet_key}`;
          const value = JSON.stringify({
            packet_key: p.packet_key,
            feature_id: p.feature_id,
            source_ref: p.source_ref,
            qdrant_point_id: p.qdrant_point_id,
          });
          await redis.setex(key, 86400, value); // 24h TTL
          cached++;

          if (cached % 500 === 0) {
            log(`  Cached ${cached}/${packets.length}`);
          }
        } else {
          cached++;
        }
      } catch (e) {
        vlog(`  ⚠️  ${p.packet_key}: ${e.message}`);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`\n✅ Cached ${cached} packets in ${duration}s\n`);

  } finally {
    await redis.quit();
    await pool.end();
  }
}

main().catch(e => {
  console.error(`❌ Fatal: ${e.message}`);
  process.exit(1);
});
