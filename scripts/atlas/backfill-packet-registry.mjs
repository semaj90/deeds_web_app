#!/usr/bin/env node
/**
 * Backfill atlas_packet_registry from atlas_packets
 * Central registry for all packet metadata across all stores
 */

import pg from 'pg';
import { createHash } from 'crypto';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const { Pool } = pg;
const ENV = loadRepoEnv(process.env);
Object.assign(process.env, ENV);

const pool = new Pool({
  connectionString: resolveDatabaseUrl(ENV)
});

async function backfillPacketRegistry() {
  const client = await pool.connect();

  try {
    console.log('[Backfill] Starting atlas_packet_registry backfill...');

    // Count source data
    const countRes = await client.query('SELECT COUNT(*) as count FROM atlas_packets');
    const packetCount = countRes.rows[0].count;
    console.log(`[Backfill] Found ${packetCount} packets in atlas_packets`);

    // Backfill from atlas_packets
    console.log('[Backfill] Executing bulk backfill...');
    const backfillResult = await client.query(`
      INSERT INTO atlas_packet_registry (
        packet_key,
        trace_id,
        source_ref,
        file_path,
        feature_id,
        summary,
        embedding_status,
        embedding_dim,
        cache_state,
        status,
        created_at,
        updated_at
      )
      SELECT
        ap.packet_key,
        md5(ap.packet_key || now()::text) as trace_id,
        ap.source_ref,
        COALESCE(ap.file_path, ap.source_ref, ap.packet_key) as file_path,
        ap.feature_id,
        ap.summary,
        'complete' as embedding_status,
        768 as embedding_dim,
        'cold' as cache_state,
        'active' as status,
        ap.created_at,
        now() as updated_at
      FROM atlas_packets ap
      ON CONFLICT (packet_key) DO NOTHING
    `);

    console.log(`[Backfill] Inserted ${backfillResult.rowCount} rows`);

    // Verify
    const verifyRes = await client.query(`
      SELECT
        COUNT(*) as total_packets,
        COUNT(CASE WHEN summary IS NOT NULL THEN 1 END) as with_summary,
        COUNT(CASE WHEN cache_state = 'cold' THEN 1 END) as cold_cache,
        COUNT(DISTINCT feature_id) as unique_features,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_packets
      FROM atlas_packet_registry
    `);

    const stats = verifyRes.rows[0];
    console.log(`
[Backfill] ✅ COMPLETE
  Total packets: ${stats.total_packets}
  With summary: ${stats.with_summary}
  Cold cache: ${stats.cold_cache}
  Unique features: ${stats.unique_features}
  Active: ${stats.active_packets}
    `);

  } catch (error) {
    console.error('[Backfill] ❌ ERROR:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

backfillPacketRegistry();
