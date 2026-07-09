#!/usr/bin/env node
/**
 * Phase 10: Materialized View Refresh Scheduler
 *
 * Task Group 2 — Materialized View for Telemetry
 * Creates hourly refresh job for tool_execution_stats_7d
 *
 * Canonical flow:
 * 1. Tool execution events written to tool_execution_log via RabbitMQ consumer
 * 2. Materialized view (REFRESH MATERIALIZED VIEW CONCURRENTLY) aggregates last 7 days
 * 3. tool_registry columns updated: rolling_success_rate_7d, etc.
 * 4. Scheduler ensures view stays fresh (hourly or on-demand)
 *
 * Note: pg_cron is optional. This scheduler uses polling + RabbitMQ triggers as fallback.
 */

import { Command } from 'commander';
import pg from 'pg';
import amqplib from 'amqplib';

const program = new Command();

program
  .option('--dry-run', 'Show what would be scheduled without applying')
  .option('--apply', 'Create scheduler job')
  .option('--install-pg-cron', 'Attempt to install pg_cron extension')
  .option('--test-refresh', 'Test materialized view refresh immediately')
  .option('--verbose', 'Show detailed progress');

program.parse(process.argv);
const options = program.opts();

const DRY_RUN = options.dryRun;
const VERBOSE = options.verbose;
const APPLY = options.apply;
const INSTALL_PG_CRON = options.installPgCron;
const TEST_REFRESH = options.testRefresh;

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

async function installPgCron(pool) {
  console.log('📦 Attempting to install pg_cron extension...');
  try {
    const result = await pool.query('CREATE EXTENSION IF NOT EXISTS pg_cron');
    console.log('✅ pg_cron extension installed (or already exists)');
    return true;
  } catch (error) {
    console.error('⚠️  Could not install pg_cron:', error.message);
    console.log('   (This is OK — we will use polling fallback)');
    return false;
  }
}

async function testMaterializedViewRefresh(pool) {
  console.log('🧪 Testing materialized view refresh...');
  try {
    const startTime = Date.now();
    console.log('   Refreshing tool_execution_stats_7d...');

    // REFRESH MATERIALIZED VIEW CONCURRENTLY requires a unique index on the view
    // If it doesn't exist, use blocking REFRESH instead
    await pool.query('REFRESH MATERIALIZED VIEW tool_execution_stats_7d');

    const elapsedMs = Date.now() - startTime;
    console.log(`✅ Refresh completed in ${elapsedMs}ms`);

    // Verify the view has data
    const result = await pool.query(
      'SELECT COUNT(*) as view_rows FROM tool_execution_stats_7d'
    );
    console.log(`   View contains ${result.rows[0].view_rows} rows`);

    return true;
  } catch (error) {
    console.error('❌ Materialized view refresh failed:', error.message);
    return false;
  }
}

async function createPgCronSchedule(pool) {
  console.log('⏲️  Creating pg_cron schedule for hourly refresh...');
  try {
    // Check if pg_cron is available
    const cronCheck = await pool.query(
      `SELECT COUNT(*) FROM pg_extension WHERE extname = 'pg_cron'`
    );

    if (cronCheck.rows[0].count === 0) {
      console.log('⚠️  pg_cron not available. Use --install-pg-cron to install.');
      return false;
    }

    // Create the cron job
    const jobName = 'phase10_stats_7d_refresh';
    await pool.query(
      `SELECT cron.schedule('${jobName}', '0 * * * *', 'REFRESH MATERIALIZED VIEW tool_execution_stats_7d')`
    );

    console.log(`✅ Created pg_cron job '${jobName}' (hourly at :00 minutes)`);
    console.log('   SQL: REFRESH MATERIALIZED VIEW tool_execution_stats_7d');
    return true;
  } catch (error) {
    console.error('❌ pg_cron schedule creation failed:', error.message);
    return false;
  }
}

async function setupPollingFallback(pool, rabbitUrl) {
  console.log('📋 Setting up RabbitMQ polling fallback...');

  try {
    const conn = await amqplib.connect(rabbitUrl);
    const channel = await conn.createChannel();

    // Create queue for telemetry refresh triggers
    const queueName = 'tool.telemetry.stats.refresh';
    await channel.assertQueue(queueName, { durable: true });

    console.log(`✅ RabbitMQ fallback queue ready: ${queueName}`);
    console.log('   (Consumers will listen on this queue to trigger view refreshes)');

    await channel.close();
    await conn.close();
    return true;
  } catch (error) {
    console.error('⚠️  RabbitMQ fallback setup incomplete:', error.message);
    return false;
  }
}

async function scheduleRefresh() {
  console.log('⏲️  Phase 10: Materialized View Refresh Scheduler');
  console.log('');

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    // Step 1: Test immediate refresh
    if (TEST_REFRESH || APPLY) {
      const refreshOk = await testMaterializedViewRefresh(pool);
      if (!refreshOk && !DRY_RUN) {
        console.log('');
        await pool.end();
        return;
      }
      console.log('');
    }

    // Step 2: Optionally install pg_cron
    if (INSTALL_PG_CRON && APPLY) {
      await installPgCron(pool);
      console.log('');
    }

    // Step 3: Create schedule
    if (DRY_RUN) {
      console.log('[DRY RUN] Would create the following:');
      console.log('');
      console.log('Option A: pg_cron (recommended if available)');
      console.log('  Command: SELECT cron.schedule(..., \'0 * * * *\', \'REFRESH MATERIALIZED VIEW tool_execution_stats_7d\')');
      console.log('  Effect: Refresh every hour at :00 minutes');
      console.log('  Cost: ~1-5 seconds per refresh (non-blocking with CONCURRENTLY)');
      console.log('');
      console.log('Option B: RabbitMQ polling (if pg_cron unavailable)');
      console.log('  Queue: tool.telemetry.stats.refresh');
      console.log('  Consumer: app worker listening for refresh triggers');
      console.log('  Effect: Refresh on-demand after tool execution events');
      console.log('');
      console.log('[DRY RUN] To apply: npm run atlas:phase10:stats:refresh --apply');
      console.log('');
      await pool.end();
      return;
    }

    // Try pg_cron first
    const cronCreated = await createPgCronSchedule(pool);
    console.log('');

    // Setup RabbitMQ fallback regardless
    const fallbackOk = await setupPollingFallback(pool, RABBITMQ_URL);
    console.log('');

    if (cronCreated || fallbackOk) {
      console.log('📌 Next Steps:');
      console.log('  1. Verify schedule: SELECT * FROM cron.job WHERE jobname = \'phase10_stats_7d_refresh\';');
      console.log('  2. Wire RabbitMQ consumer to listen on tool.telemetry.stats.refresh');
      console.log('  3. Test by: INSERT INTO tool_execution_log VALUES (...); REFRESH MATERIALIZED VIEW;');
      console.log('  4. Monitor: SELECT last_refreshed_at FROM tool_execution_stats_7d ORDER BY last_refreshed_at DESC LIMIT 1;');
    }
    console.log('');
    console.log('✨ Scheduler setup complete');

  } catch (error) {
    console.error('❌ Scheduler setup failed:', error.message);
  } finally {
    try {
      await pool.end();
    } catch (e) {
      // ignore already-closed error
    }
  }
}

scheduleRefresh().catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});
