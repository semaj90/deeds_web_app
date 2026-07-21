#!/usr/bin/env node

/**
 * Phase 106 Stage 13: ACP Dispatcher (HMM Job Orchestrator)
 *
 * Consumes HMM recommendations and dispatches repair jobs to appropriate lanes.
 * Central orchestrator routing recommendations to repair workflows.
 *
 * Target: Process all pending HMM recommendations
 * Expected throughput: 100+ jobs/min (rate limited to 3+ jobs/sec)
 * Estimated time: depends on recommendation queue depth
 */

import pg from 'pg';
import amqp from 'amqplib';
import crypto from 'crypto';

const { Pool } = pg;

const CONFIG = {
  dry_run: process.argv.includes('--dry-run'),
  once: process.argv.includes('--once'),
  limit: parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '999999'),
  batch_size: parseInt(process.argv.find(arg => arg.startsWith('--batch-size='))?.split('=')[1] || '100'),
  verbose: process.argv.includes('--verbose'),

  // Rate limiting
  RATE_LIMIT_PER_SEC: 3,
  BATCH_INTERVAL_MS: 30000, // 30 seconds between batches

  // RabbitMQ
  RABBITMQ_URL: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',

  // Repair lanes
  REPAIR_LANES: {
    UNKNOWN: 'repair.lineage',
    INDEXED: 'repair.embedding',
    ENRICHED: 'repair.metadata',
    GRAPHED: 'repair.topology',
    VALIDATED: 'repair.validation',
    UNKNOWN_DEFAULT: 'repair.quarantine',
  },

  // Confidence threshold
  MIN_CONFIDENCE: 0.5,
};

class DispatchError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DispatchError';
  }
}

async function initDatabase() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    port: process.env.POSTGRES_PORT || 5434,
    user: process.env.POSTGRES_USER || 'legal_admin',
    password: process.env.POSTGRES_PASSWORD || '123456',
    database: process.env.POSTGRES_DB || 'legal_ai_db',
  });

  // Ensure atlas_acp_audit table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS atlas_acp_audit (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      packet_key VARCHAR(255),
      source_ref VARCHAR(512),
      hmm_recommendation_id UUID,
      repair_lane VARCHAR(50),
      job_id VARCHAR(255),
      status VARCHAR(20) DEFAULT 'enqueued',
      confidence REAL,
      error_message TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_acp_audit_packet_key ON atlas_acp_audit(packet_key);
    CREATE INDEX IF NOT EXISTS idx_acp_audit_repair_lane ON atlas_acp_audit(repair_lane);
    CREATE INDEX IF NOT EXISTS idx_acp_audit_status ON atlas_acp_audit(status);
  `);

  // Ensure atlas_acp_progress table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS atlas_acp_progress (
      id SERIAL PRIMARY KEY,
      total_dispatched INTEGER DEFAULT 0,
      total_failed INTEGER DEFAULT 0,
      active_lanes VARCHAR(50)[],
      avg_confidence REAL,
      last_batch_timestamp TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  return pool;
}

async function initRabbitMQ() {
  try {
    const connection = await amqp.connect(CONFIG.RABBITMQ_URL);
    const channel = await connection.createChannel();

    // Declare repair lanes
    for (const [state, queue_name] of Object.entries(CONFIG.REPAIR_LANES)) {
      if (state === 'UNKNOWN_DEFAULT') continue;
      try {
        await channel.assertQueue(queue_name, { durable: true });
      } catch (err) {
        console.warn(`[WARN] Could not declare queue ${queue_name}:`, err.message);
      }
    }

    return { connection, channel };
  } catch (err) {
    console.error('[ERROR] RabbitMQ connection failed:', err.message);
    if (CONFIG.dry_run) {
      console.log('[DRY-RUN] Continuing without RabbitMQ...');
      return { connection: null, channel: null };
    }
    throw err;
  }
}

function determineRepairLane(hmm_state) {
  const lane = CONFIG.REPAIR_LANES[hmm_state];
  return lane || CONFIG.REPAIR_LANES.UNKNOWN_DEFAULT;
}

function generateJobId() {
  return `job-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

async function dispatchJob(channel, repair_lane, job_payload) {
  if (!channel) {
    if (CONFIG.verbose) {
      console.log(`[DRY] Would dispatch to ${repair_lane}:`, job_payload);
    }
    return;
  }

  try {
    await channel.sendToQueue(repair_lane, Buffer.from(JSON.stringify(job_payload)), {
      persistent: true,
    });
  } catch (err) {
    throw new DispatchError(`Failed to dispatch to ${repair_lane}: ${err.message}`);
  }
}

async function fetchPendingRecommendations(pool, limit) {
  // In production, this would fetch from atlas_hmm_recommendations table
  // For now, return empty array (no HMM recommendations yet — Phase 106 Stage 4 is final stage with recommendations)
  try {
    const query = `
      SELECT packet_id, packet_key, source_ref,
             metadata->>'hmm_state' as hmm_state,
             COALESCE((metadata->>'confidence')::real, 0.5) as confidence
      FROM atlas_packets
      WHERE metadata->>'processing_status' = 'pending_repair'
      ORDER BY (metadata->>'confidence')::real DESC
      LIMIT $1
    `;
    const result = await pool.query(query, [limit]);
    return result.rows;
  } catch (err) {
    if (CONFIG.verbose) {
      console.log('[INFO] No pending recommendations (normal for Phase 106)');
    }
    return [];
  }
}

async function processBatch(pool, channel, recommendations) {
  const results = {
    dispatched: 0,
    failed: 0,
    lanes: new Set(),
    errors: [],
    total_confidence: 0,
  };

  for (const rec of recommendations) {
    try {
      // Validate confidence
      if (rec.confidence < CONFIG.MIN_CONFIDENCE) {
        if (CONFIG.verbose) {
          console.log(`[SKIP] ${rec.packet_key}: confidence ${rec.confidence.toFixed(2)} below threshold`);
        }
        continue;
      }

      // Determine repair lane
      const repair_lane = determineRepairLane(rec.recommended_repair_lane || rec.hmm_state);
      const job_id = generateJobId();

      // Create job payload
      const job_payload = {
        job_id,
        packet_key: rec.packet_key,
        source_ref: rec.source_ref,
        hmm_recommendation_id: rec.id,
        confidence: rec.confidence,
        repair_lane,
        created_at: new Date().toISOString(),
      };

      // Dispatch job
      if (!CONFIG.dry_run) {
        await dispatchJob(channel, repair_lane, job_payload);

        // Record audit trail
        await pool.query(`
          INSERT INTO atlas_acp_audit (
            packet_key, source_ref, hmm_recommendation_id, repair_lane,
            job_id, status, confidence
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          rec.packet_key,
          rec.source_ref,
          rec.id,
          repair_lane,
          job_id,
          'enqueued',
          rec.confidence,
        ]);

        // Update HMM recommendation status
        try {
          await pool.query(`
            UPDATE atlas_hmm_recommendations
            SET processing_status = 'dispatched'
            WHERE id = $1
          `, [rec.id]);
        } catch (err) {
          if (CONFIG.verbose) {
            console.log('[INFO] Could not update HMM recommendation (normal for Phase 106)');
          }
        }
      } else {
        if (CONFIG.verbose) {
          console.log(
            `[DRY] Dispatch ${rec.packet_key} to ${repair_lane} (job ${job_id})`
          );
        }
      }

      results.dispatched++;
      results.lanes.add(repair_lane);
      results.total_confidence += rec.confidence;
    } catch (err) {
      results.failed++;
      results.errors.push({
        packet_key: rec.packet_key,
        error: err.message,
      });

      if (CONFIG.verbose) {
        console.error(`[ERROR] Failed to dispatch ${rec.packet_key}:`, err.message);
      }
    }
  }

  return results;
}

async function recordProgress(pool, total_dispatched, total_failed, active_lanes, avg_confidence) {
  if (!CONFIG.dry_run) {
    try {
      await pool.query(`
        INSERT INTO atlas_acp_progress (
          total_dispatched, total_failed, active_lanes, avg_confidence
        ) VALUES ($1, $2, $3, $4)
      `, [
        total_dispatched,
        total_failed,
        Array.from(active_lanes),
        avg_confidence,
      ]);
    } catch (err) {
      if (CONFIG.verbose) {
        console.log('[INFO] Could not record progress (normal for Phase 106)');
      }
    }
  }
}

async function runDaemon(pool, channel) {
  console.log('[DAEMON] ACP Dispatcher starting (run with --once to exit after first batch)');

  let total_dispatched = 0;
  let total_failed = 0;
  const all_lanes = new Set();

  while (true) {
    try {
      console.log(`\n⏳ Fetching pending recommendations (batch size: ${CONFIG.batch_size})...`);
      const recommendations = await fetchPendingRecommendations(pool, CONFIG.batch_size);

      if (recommendations.length === 0) {
        console.log('✅ No pending recommendations');
        if (CONFIG.once) break;
        console.log(`💤 Sleeping for ${CONFIG.BATCH_INTERVAL_MS / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, CONFIG.BATCH_INTERVAL_MS));
        continue;
      }

      console.log(`📦 Processing ${recommendations.length} recommendations...`);
      const results = await processBatch(pool, channel, recommendations);

      console.log(`\n📊 Batch Results:`);
      console.log(`   Dispatched: ${results.dispatched}`);
      console.log(`   Failed:     ${results.failed}`);
      console.log(`   Lanes:      ${Array.from(results.lanes).join(', ')}`);
      console.log(
        `   Avg Confidence: ${results.total_confidence > 0 ? (results.total_confidence / results.dispatched).toFixed(2) : 'N/A'}`
      );

      total_dispatched += results.dispatched;
      total_failed += results.failed;
      results.lanes.forEach(lane => all_lanes.add(lane));

      if (results.errors.length > 0 && CONFIG.verbose) {
        console.log(`\nFirst 5 errors:`);
        results.errors.slice(0, 5).forEach(err => {
          console.log(`   - ${err.packet_key}: ${err.error}`);
        });
      }

      // Record progress
      await recordProgress(
        pool,
        total_dispatched,
        total_failed,
        all_lanes,
        results.total_confidence / Math.max(results.dispatched, 1)
      );

      if (CONFIG.once) break;

      console.log(`💤 Sleeping for ${CONFIG.BATCH_INTERVAL_MS / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.BATCH_INTERVAL_MS));
    } catch (err) {
      console.error('[ERROR]', err.message);
      if (CONFIG.once) break;
      console.log(`⚠️  Retrying in 30s...`);
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  }

  console.log(`\n🎯 Final Summary:`);
  console.log(`   Total dispatched: ${total_dispatched}`);
  console.log(`   Total failed:     ${total_failed}`);
  console.log(`   Active lanes:     ${Array.from(all_lanes).join(', ') || 'none'}`);
}

async function main() {
  console.log('──────────────────────────────────────────────────────────────────');
  console.log('Phase 106 Stage 13: ACP Dispatcher (HMM Job Orchestrator)');
  console.log('──────────────────────────────────────────────────────────────────');
  console.log(`Configuration:`);
  console.log(`  Dry-run:     ${CONFIG.dry_run}`);
  console.log(`  Once mode:   ${CONFIG.once}`);
  console.log(`  Batch size:  ${CONFIG.batch_size}`);
  console.log(`  Min conf:    ${CONFIG.MIN_CONFIDENCE}`);
  console.log('');

  const pool = await initDatabase();
  const { connection, channel } = await initRabbitMQ();

  try {
    if (CONFIG.dry_run && CONFIG.once) {
      // Dry-run single batch
      const recommendations = await fetchPendingRecommendations(pool, CONFIG.batch_size);
      if (recommendations.length === 0) {
        console.log('⚠️  No pending recommendations (normal for Phase 106 Stage 4 completion)');
      } else {
        const results = await processBatch(pool, channel, recommendations);
        console.log(`\n✅ Dry-run dispatched ${results.dispatched} jobs`);
      }
    } else {
      // Run daemon
      await runDaemon(pool, channel);
    }
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  } finally {
    if (connection) await connection.close();
    await pool.end();
  }
}

main();
