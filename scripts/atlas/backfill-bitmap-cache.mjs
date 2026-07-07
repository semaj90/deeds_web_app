#!/usr/bin/env node

/**
 * Backfill Bitmap Cache from Existing Gate Flags
 *
 * Reads gate flags from Postgres and populates Redis bitmap cache
 * for all packets. Enables Phase 3 bitmap optimization.
 */

import Redis from 'ioredis';
import pg from 'pg';
import { loadRepoEnv, resolveRedisConfig, resolveDatabaseUrl } from './connection-config.mjs';

const isDryRun = process.argv.includes('--dry-run');
const verbose = process.argv.includes('--verbose');
const batchSize = 500;

function log(msg) {
  if (verbose) console.log(`[backfill-bitmap] ${msg}`);
}

async function main() {
  const env = loadRepoEnv();

  const redisConfig = resolveRedisConfig(env);
  const databaseUrl = resolveDatabaseUrl(env);

  const redis = new Redis({
    ...redisConfig,
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  const pool = new pg.Pool({ connectionString: databaseUrl });

  try {
    await redis.connect();
    log('Connected to Redis/Valkey');

    const client = await pool.connect();
    try {
      // Fetch all packets with gate flags
      const query = `
        SELECT
          packet_id,
          packet_key,
          (feature_id IS NOT NULL) as gate_0_feature_id_present,
          (canonical_source_ref IS NOT NULL) as gate_1_source_ref_trusted,
          (identity_confidence > 0.8) as gate_2_ace_cache_hit,
          (title_id IS NOT NULL) as gate_3_kag_neighbor_available,
          (embedding IS NOT NULL OR content_embedding_384 IS NOT NULL) as gate_4_dag_edge_exists,
          (summary IS NOT NULL AND LENGTH(COALESCE(summary, '')) > 10) as gate_5_summary_exists,
          (content_embedding_384 IS NOT NULL) as gate_6_embedding_exists,
          (updated_at >= NOW() - INTERVAL '24 hours') as gate_7_all_mirrors_synced
        FROM atlas_packets
        WHERE packet_key IS NOT NULL
        ORDER BY packet_id;
      `;

      const result = await client.query(query);
      const packets = result.rows;

      log(`Found ${packets.length} packets to backfill`);

      if (isDryRun) {
        console.log(`[DRY-RUN] Would backfill ${packets.length} packets`);

        // Show sample
        if (packets.length > 0) {
          const sample = packets[0];
          const bitmap =
            (sample.gate_0_feature_id_present ? 1 : 0) |
            ((sample.gate_1_source_ref_trusted ? 1 : 0) << 1) |
            ((sample.gate_2_ace_cache_hit ? 1 : 0) << 2) |
            ((sample.gate_3_kag_neighbor_available ? 1 : 0) << 3) |
            ((sample.gate_4_dag_edge_exists ? 1 : 0) << 4) |
            ((sample.gate_5_summary_exists ? 1 : 0) << 5) |
            ((sample.gate_6_embedding_exists ? 1 : 0) << 6) |
            ((sample.gate_7_all_mirrors_synced ? 1 : 0) << 7);

          console.log(`\nSample packet: ${sample.packet_key}`);
          console.log(`  Gates: ${bitmap.toString(2).padStart(8, '0')} (decimal: ${bitmap})`);
          console.log(`  Feature ID present: ${sample.gate_0_feature_id_present}`);
          console.log(`  Source ref trusted: ${sample.gate_1_source_ref_trusted}`);
          console.log(`  ACE cache hit: ${sample.gate_2_ace_cache_hit}`);
          console.log(`  KAG neighbor: ${sample.gate_3_kag_neighbor_available}`);
          console.log(`  DAG edge: ${sample.gate_4_dag_edge_exists}`);
          console.log(`  Summary exists: ${sample.gate_5_summary_exists}`);
          console.log(`  Embedding exists: ${sample.gate_6_embedding_exists}`);
          console.log(`  All mirrors synced: ${sample.gate_7_all_mirrors_synced}`);
        }
        return;
      }

      // Apply backfill in batches
      let processed = 0;
      for (let i = 0; i < packets.length; i += batchSize) {
        const batch = packets.slice(i, Math.min(i + batchSize, packets.length));

        const pipeline = redis.pipeline();

        for (const packet of batch) {
          const key = `atlas:mask:packet:${packet.packet_key}`;

          // Build bitmap byte from gates
          let bitmap = 0;
          bitmap |= (packet.gate_0_feature_id_present ? 1 : 0) << 0;
          bitmap |= (packet.gate_1_source_ref_trusted ? 1 : 0) << 1;
          bitmap |= (packet.gate_2_ace_cache_hit ? 1 : 0) << 2;
          bitmap |= (packet.gate_3_kag_neighbor_available ? 1 : 0) << 3;
          bitmap |= (packet.gate_4_dag_edge_exists ? 1 : 0) << 4;
          bitmap |= (packet.gate_5_summary_exists ? 1 : 0) << 5;
          bitmap |= (packet.gate_6_embedding_exists ? 1 : 0) << 6;
          bitmap |= (packet.gate_7_all_mirrors_synced ? 1 : 0) << 7;

          // Write as binary string (Valkey SETBIT accepts binary data)
          pipeline.setbit(key, 0, (bitmap & 0x01) >> 0);
          pipeline.setbit(key, 1, (bitmap & 0x02) >> 1);
          pipeline.setbit(key, 2, (bitmap & 0x04) >> 2);
          pipeline.setbit(key, 3, (bitmap & 0x08) >> 3);
          pipeline.setbit(key, 4, (bitmap & 0x10) >> 4);
          pipeline.setbit(key, 5, (bitmap & 0x20) >> 5);
          pipeline.setbit(key, 6, (bitmap & 0x40) >> 6);
          pipeline.setbit(key, 7, (bitmap & 0x80) >> 7);

          // Set TTL to 24 hours
          pipeline.expire(key, 86400);
        }

        const results = await pipeline.exec();
        processed += batch.length;

        if (results.some((r) => r[0] instanceof Error)) {
          console.error(`[ERROR] Batch ${i / batchSize + 1} had errors`);
          results.forEach((r, idx) => {
            if (r[0] instanceof Error) {
              console.error(`  Item ${idx}: ${r[0].message}`);
            }
          });
        }

        log(`Processed ${processed}/${packets.length} packets`);
      }

      console.log(`\n✅ Backfill complete: ${processed} packets`);
      console.log(`   Redis keys created: ${processed}`);
      console.log(`   TTL: 24 hours`);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(`[ERROR] ${err.message}`);
    process.exit(1);
  } finally {
    await redis.quit();
    await pool.end();
  }
}

main();