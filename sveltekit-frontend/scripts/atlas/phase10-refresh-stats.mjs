#!/usr/bin/env node
/**
 * Phase 10: Refresh tool_execution_stats_7d materialized view
 * Computed hourly from tool_execution_log for operational queries
 *
 * Purpose: Update rolling 7-day telemetry statistics
 * Timing: ~30 seconds with 10K+ log entries (non-blocking)
 * Output: Refreshed stats available for HMM observation layer
 */

import Database from 'better-sqlite3';
import { pool } from '../lib/db.mjs';

const BATCH_SIZE = 1000;

async function refreshStats() {
  console.log('🔄 Phase 10: Refreshing tool_execution_stats_7d materialized view');
  console.log('');

  try {
    const startTime = Date.now();

    // Refresh the materialized view
    console.log('⏳ Refreshing materialized view (CONCURRENTLY)...');

    const result = await pool.query(`
      REFRESH MATERIALIZED VIEW CONCURRENTLY tool_execution_stats_7d;
    `);

    const elapsed = Date.now() - startTime;
    console.log(`✅ Materialized view refreshed in ${elapsed}ms`);
    console.log('');

    // Verify stats were computed
    const statsCheck = await pool.query(`
      SELECT
        COUNT(*) as tool_count,
        COUNT(CASE WHEN rolling_success_rate > 0 THEN 1 END) as tools_with_stats,
        MIN(rolling_success_rate)::numeric(3,2) as min_success_rate,
        MAX(rolling_success_rate)::numeric(3,2) as max_success_rate,
        AVG(rolling_success_rate)::numeric(3,2) as avg_success_rate,
        MAX(last_refreshed_at) as latest_refresh
      FROM tool_execution_stats_7d;
    `);

    if (statsCheck.rows.length > 0) {
      const stats = statsCheck.rows[0];
      console.log('📊 Stats Summary:');
      console.log(`   • Tools tracked: ${stats.tool_count}`);
      console.log(`   • Tools with stats: ${stats.tools_with_stats}`);
      console.log(`   • Success rate range: ${stats.min_success_rate} - ${stats.max_success_rate}`);
      console.log(`   • Average success rate: ${stats.avg_success_rate}`);
      console.log(`   • Latest refresh: ${stats.latest_refresh}`);
      console.log('');
    }

    // Sync stats to tool_registry for HMM observation layer
    console.log('🔗 Syncing stats to tool_registry...');

    const syncResult = await pool.query(`
      UPDATE tool_registry tr
      SET
        rolling_success_rate_7d = tes.rolling_success_rate,
        timeout_count = tes.timeout_count,
        schema_mismatch_count = tes.schema_mismatch_count,
        updated_at = NOW()
      FROM tool_execution_stats_7d tes
      WHERE tr.tool_id = tes.tool_id;
    `);

    console.log(`✅ Updated ${syncResult.rowCount} tool_registry rows`);
    console.log('');

    console.log('✨ Phase 10 stats refresh complete!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error refreshing stats:', error);
    process.exit(1);
  }
}

// Run the refresh
refreshStats();
