#!/usr/bin/env node

import pg from 'pg';

const isVerbose = process.argv.includes('--verbose');
const log = (msg) => console.log(`[P1.5 Trace] ${msg}`);
const verbose = (msg) => isVerbose && console.log(`  ${msg}`);

async function getDb() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
  });
  return pool;
}

async function main() {
  const db = await getDb();

  try {
    log('Analyzing error root causes and fix attribution...');

    // Errors by component/context
    const byContextResult = await db.query(`
      SELECT
        context_key,
        error_category,
        COUNT(*) as error_count,
        MIN(created_at) as first_occurrence,
        MAX(created_at) as last_occurrence,
        STRING_AGG(DISTINCT message, '; ' ORDER BY message DESC) FILTER (WHERE message IS NOT NULL) as sample_messages
      FROM error_logs
      GROUP BY context_key, error_category
      ORDER BY error_count DESC
    `);

    log('\n=== Errors by Context ===');
    const contextMap = new Map();
    for (const row of byContextResult.rows) {
      const ctx = row.context_key || '(none)';
      verbose(`${ctx} [${row.error_category}]:`);
      verbose(`  Count: ${row.error_count}`);
      verbose(`  First: ${row.first_occurrence?.toISOString() || 'N/A'}`);
      verbose(`  Last: ${row.last_occurrence?.toISOString() || 'N/A'}`);
      verbose(`  Sample: ${row.sample_messages || 'N/A'}`);

      if (!contextMap.has(ctx)) {
        contextMap.set(ctx, 0);
      }
      contextMap.set(ctx, contextMap.get(ctx) + row.error_count);
    }

    // Infer root causes
    log('\n=== Root Cause Attribution ===');

    const embedErrors = byContextResult.rows.filter(r => r.context_key === 'embed');
    if (embedErrors.length > 0 && embedErrors.every(r => r.error_category === 'inference_error')) {
      log('✓ Inferred Root Cause: Embedding service (Ollama) downtime');
      verbose('  Evidence: All errors from embed context, all category inference_error');
      const hours = (embedErrors[0].last_occurrence - embedErrors[0].first_occurrence) / (1000 * 60 * 60);
      verbose(`  Timespan: ${hours.toFixed(1)} hours`);
      verbose('  Fix Attribution: health_check_and_restart');
    }

    // Timeline analysis
    const timelineResult = await db.query(`
      SELECT
        DATE_TRUNC('hour', created_at) as hour_bucket,
        error_category,
        COUNT(*) as count
      FROM error_logs
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY DATE_TRUNC('hour', created_at), error_category
      ORDER BY hour_bucket DESC
      LIMIT 24
    `);

    if (timelineResult.rows.length > 0) {
      log('\n=== Error Timeline (Last 24 hours) ===');
      for (const row of timelineResult.rows) {
        verbose(`${row.hour_bucket?.toISOString() || 'Unknown'}: ${row.count} ${row.error_category} errors`);
      }
    }

    // Fix success rate by strategy
    const strategyResult = await db.query(`
      SELECT
        fix_strategy,
        COUNT(*) as applied_count,
        SUM(CASE WHEN resolved = true THEN 1 ELSE 0 END) as success_count
      FROM error_logs
      WHERE fix_strategy IS NOT NULL
      GROUP BY fix_strategy
      ORDER BY success_count DESC
    `);

    if (strategyResult.rows.length > 0) {
      log('\n=== Fix Strategy Success Rates ===');
      for (const row of strategyResult.rows) {
        const rate = (row.success_count / row.applied_count) * 100;
        log(`${row.fix_strategy}: ${rate.toFixed(1)}% success (${row.success_count}/${row.applied_count})`);
      }
    }

    // Components with most errors
    const componentResult = await db.query(`
      SELECT
        error_category,
        COUNT(*) as total,
        COUNT(CASE WHEN resolved = false THEN 1 END) as unresolved,
        ROUND(100.0 * COUNT(CASE WHEN resolved = true THEN 1 END) / COUNT(*), 1) as fix_rate
      FROM error_logs
      GROUP BY error_category
      ORDER BY total DESC
    `);

    log('\n=== Component Health Summary ===');
    for (const row of componentResult.rows) {
      log(`${row.error_category}:`);
      verbose(`  Total: ${row.total} | Unresolved: ${row.unresolved} | Fix Rate: ${row.fix_rate}%`);
    }

    log('\n✓ Root cause analysis complete');

  } finally {
    await db.end();
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
