#!/usr/bin/env node
/**
 * Backfill atlas_packet_registry from atlas_packets
 * Central registry for all packet metadata across all stores
 */

import pg from 'pg';
import { createHash } from 'crypto';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

async function backfillPacketRegistry() {
  const client = await pool.connect();

  try {
    console.log('[Backfill] Starting atlas_packet_registry backfill...');

    // Count source data
    const countRes = await client.query('SELECT COUNT(*) as count FROM atlas_packets');
    const packetCount = countRes.rows[0].count;
    console.log(`[Backfill] Found ${packetCount} packets in atlas_packets`);

    // Insert test row
    console.log('[Backfill] Testing insert with test row...');
    await client.query(
      `INSERT INTO atlas_packet_registry (packet_key, source_ref, file_path, feature_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (packet_key) DO NOTHING`,
      ['test:backfill:registry', 'src/test.ts', 'src/test.ts', 'test.backfill']
    );

    const testCheck = await client.query(
      'SELECT COUNT(*) as count FROM atlas_packet_registry WHERE packet_key = $1',
      ['test:backfill:registry']
    );
    console.log(`[Backfill] Test row inserted: ${testCheck.rows[0].count > 0 ? 'YES' : 'NO'}`);

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
        encode(digest(ap.packet_key || now()::text, 'md5'), 'hex') as trace_id,
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
