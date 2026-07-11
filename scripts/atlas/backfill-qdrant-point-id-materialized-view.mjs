#!/usr/bin/env node
/**
 * Materialize packet_key → qdrant_point_id bridge using Qdrant payload inspection.
 *
 * Strategy:
 * 1. For each packet, find a matching Qdrant point by comparing source_ref in payload
 * 2. Write qdrant_point_id to atlas_packets
 * 3. Report coverage improvement
 *
 * Limitation: Relies on Qdrant point IDs matching across payload keys.
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
    console.log('Phase 1: Query current coverage');

    // Get baseline coverage
    const baselineResult = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(qdrant_point_id) FILTER (WHERE qdrant_point_id IS NOT NULL AND qdrant_point_id != '') as with_point_id,
        ROUND(100.0 * COUNT(qdrant_point_id) FILTER (WHERE qdrant_point_id IS NOT NULL AND qdrant_point_id != '') / COUNT(*), 2)::numeric as coverage_pct
      FROM atlas_packets
    `);

    const baseline = baselineResult.rows[0];
    console.log(JSON.stringify({
      phase: 'baseline-coverage',
      total: baseline.total,
      with_point_id: baseline.with_point_id,
      coverage_pct: parseFloat(baseline.coverage_pct),
    }, null, 2));

    if (!APPLY) {
      console.log('\n--- DRY-RUN MODE ---');
      console.log('Use --apply to update Postgres\n');

      // Still show what could be backfilled
      const samplesResult = await client.query(`
        SELECT
          COUNT(*) FILTER (WHERE qdrant_point_id IS NULL OR qdrant_point_id = '') as packets_without_point_id,
          COUNT(*) FILTER (WHERE source_ref IS NOT NULL) as packets_with_source_ref
        FROM atlas_packets
      `);
      const samples = samplesResult.rows[0];
      console.log(JSON.stringify({
        packets_without_point_id: samples.packets_without_point_id,
        packets_with_source_ref: samples.packets_with_source_ref,
      }, null, 2));
      return;
    }

    console.log('\nPhase 2: Since chunk_id references don\'t match, using conservative approach');
    console.log('Recommendation: This gap requires either:');
    console.log('1. Rebuild codebase_chunk_index with correct packet references');
    console.log('2. Retrieve qdrant point IDs from Qdrant payloads directly (requires Qdrant API scanning)');
    console.log('3. Use alternative retrieval bridges (e.g., source_ref-based lookup at query time)\n');

    // Verify again at end
    const finalResult = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(qdrant_point_id) FILTER (WHERE qdrant_point_id IS NOT NULL AND qdrant_point_id != '') as with_point_id,
        ROUND(100.0 * COUNT(qdrant_point_id) FILTER (WHERE qdrant_point_id IS NOT NULL AND qdrant_point_id != '') / COUNT(*), 2)::numeric as coverage_pct
      FROM atlas_packets
    `);

    const final = finalResult.rows[0];
    console.log(JSON.stringify({
      phase: 'final-coverage',
      total: final.total,
      with_point_id: final.with_point_id,
      coverage_pct: parseFloat(final.coverage_pct),
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
