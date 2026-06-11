#!/usr/bin/env node

/**
 * Phase 3E.1: Recompute Concept Temperatures
 *
 * Batch job to recalculate concept_temperature for all concepts in the database.
 * Runs every 6 hours (or on-demand) to keep behavioral ranking fresh.
 *
 * Formula:
 *   temperature = 0.50 · recent_retrievals + 0.30 · repair_success + 0.20 · fusion_rate
 */

import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:legal_password@127.0.0.1:5434/legal_ai_db';

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    console.log('[Phase 3E.1] Starting concept temperature recomputation...');

    const result = await pool.query(`
      update concept_records
      set concept_temperature = least(1.0, greatest(0.0,
        0.50 * (
          least(100.0, coalesce((
            select count(*)::float
            from retrieval_telemetry
            where
              created_at >= now() - interval '7 days'
              and (
                selected_feature_id = any(concept_records.feature_ids)
                or selected_packet_key = any(concept_records.packet_keys)
              )
          ), 0)) / 100.0
        )
        + 0.30 * (
          case
            when (success_count + failure_count) = 0 then 0.5
            else success_count::float / (success_count + failure_count)::float
          end
        )
        + 0.20 * (
          case
            when retrieval_count = 0 then 0.0
            else coalesce((strategy_distribution->>'fusion')::integer, 0)::float / retrieval_count::float
          end
        )
      )),
      updated_at = now()
    `);

    console.log(`[Phase 3E.1] Updated ${result.rowCount} concepts ✅`);
  } catch (err) {
    console.error('[Phase 3E.1] Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
