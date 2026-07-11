#!/usr/bin/env node
/**
 * Backfill qdrant_point_id from codebase_chunk_index → atlas_packets join.
 *
 * The canonical source of packet-to-qdrant mapping is:
 * - codebase_chunk_index.source_ref + content_hash → packet_key
 * - qdrant payload contains source_ref + content_hash
 * - Use these to materialize the bridge
 */

import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const { Pool } = pg;
const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

const env = loadRepoEnv(process.env);
const pool = new Pool({ connectionString: resolveDatabaseUrl(env) });

async function main() {
  const client = await pool.connect();
  try {
    console.log('Phase: Analyze packet-chunk join coverage');

    // Check how many packets have chunks with embeddings
    const coverageResult = await client.query(`
      SELECT
        COUNT(DISTINCT ap.packet_key) as packets_total,
        COUNT(DISTINCT cci.id) FILTER (WHERE cci.qdrant_id IS NOT NULL AND cci.qdrant_id != '') as chunks_with_qdrant_id,
        COUNT(DISTINCT ap.chunk_id) FILTER (WHERE cci.qdrant_id IS NOT NULL AND cci.qdrant_id != '') as packets_with_chunk_qdrant
      FROM atlas_packets ap
      LEFT JOIN codebase_chunk_index cci ON cci.id = ap.chunk_id
    `);

    const coverage = coverageResult.rows[0];
    console.log(JSON.stringify({
      phase: 'coverage-analysis',
      packets_total: coverage.packets_total,
      chunks_with_qdrant_id: coverage.chunks_with_qdrant_id,
      packets_with_chunk_qdrant: coverage.packets_with_chunk_qdrant,
    }, null, 2));

    if (!APPLY) {
      console.log('\n--- DRY-RUN MODE ---\nUse --apply to update Postgres\n');
      return;
    }

    console.log('\nPhase: Backfill qdrant_point_id from chunks');

    // Update atlas_packets.qdrant_point_id from chunk points
    // Strategy: map chunk_id to qdrant_id directly
    const updateResult = await client.query(`
      UPDATE atlas_packets ap
      SET
        qdrant_point_id = cci.qdrant_id,
        updated_at = NOW()
      FROM codebase_chunk_index cci
      WHERE ap.chunk_id = cci.id
        AND cci.qdrant_id IS NOT NULL
        AND cci.qdrant_id != ''
        AND (ap.qdrant_point_id IS NULL OR ap.qdrant_point_id = '')
    `);

    console.log(JSON.stringify({
      phase: 'backfill-applied',
      rows_updated: updateResult.rowCount,
    }, null, 2));

    // Verify coverage after update
    const verifyResult = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(qdrant_point_id) FILTER (WHERE qdrant_point_id IS NOT NULL AND qdrant_point_id != '') as with_point_id,
        ROUND(100.0 * COUNT(qdrant_point_id) FILTER (WHERE qdrant_point_id IS NOT NULL AND qdrant_point_id != '') / COUNT(*), 2) as coverage_pct
      FROM atlas_packets
    `);

    const verify = verifyResult.rows[0];
    console.log(JSON.stringify({
      phase: 'verification',
      total: verify.total,
      with_point_id: verify.with_point_id,
      coverage_pct: parseFloat(verify.coverage_pct),
    }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
