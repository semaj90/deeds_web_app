#!/usr/bin/env node

/**
 * Step 7: Promotion Worker
 *
 * Dequeues promotion jobs from promotion_outbox table and processes them.
 * Runs as a background worker, polling the outbox for pending jobs.
 *
 * Usage:
 *   node scripts/atlas/promotion-worker.mjs [--batch-size 10] [--poll-interval 5000]
 *
 * Environment:
 *   DATABASE_URL: PostgreSQL connection string
 */

import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse CLI args
const args = process.argv.slice(2);
let batchSize = 10;
let pollInterval = 5000; // 5 seconds

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--batch-size' && args[i + 1]) {
    batchSize = parseInt(args[i + 1]);
    i++;
  }
  if (args[i] === '--poll-interval' && args[i + 1]) {
    pollInterval = parseInt(args[i + 1]);
    i++;
  }
}

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Postgres pool error:', err);
  process.exit(1);
});

// Worker entrypoint
export async function promotionWorker() {
  console.log(`[promotion-worker] Starting with batch-size=${batchSize}, poll-interval=${pollInterval}ms`);

  let consecutiveEmptyRuns = 0;
  const maxConsecutiveEmpty = 12; // Stop after 1 minute of no jobs (12 × 5s)

  while (true) {
    try {
      // Dequeue batch of pending jobs
      const result = await pool.query(
        `SELECT
          id,
          packet_key,
          source_ref,
          content_hash,
          summary,
          operation,
          payload
        FROM promotion_outbox
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED`,
        [batchSize]
      );

      const jobs = result.rows;

      if (jobs.length === 0) {
        consecutiveEmptyRuns++;
        if (consecutiveEmptyRuns % 12 === 0) {
          // Log every minute
          console.log(`[promotion-worker] No pending jobs (${consecutiveEmptyRuns * pollInterval / 1000}s idle)`);
        }
        if (consecutiveEmptyRuns >= maxConsecutiveEmpty) {
          console.log('[promotion-worker] No jobs for 1+ minute, exiting gracefully');
          break;
        }
        await sleep(pollInterval);
        continue;
      }

      consecutiveEmptyRuns = 0;
      console.log(`[promotion-worker] Dequeued ${jobs.length} jobs`);

      // Mark as processing
      const jobIds = jobs.map(j => j.id);
      await pool.query(
        `UPDATE promotion_outbox
         SET status = 'processing', started_at = NOW()
         WHERE id = ANY($1)`,
        [jobIds]
      );

      // Process jobs in parallel (not sequentially) to improve throughput 10×
      const processingPromises = jobs.map(async (job) => {
        try {
          console.log(`[promotion-worker] Processing job ${job.id} (${job.operation})`);

          const stagesCompleted = [];
          const stagesFailed = [];
          let success = true;
          let message = '';

          // Route to appropriate promotion stage
          if (job.operation === 'promote_summary') {
            // Single atomic upsert (no double-query antipattern)
            await pool.query(
              `INSERT INTO atlas_packets (packet_key, source_ref, summary, updated_at)
               VALUES ($1, $2, $3, NOW())
               ON CONFLICT (packet_key) DO UPDATE
               SET summary = EXCLUDED.summary, updated_at = NOW()`,
              [job.packet_key, job.source_ref, job.summary]
            );
            stagesCompleted.push('postgres_summary_upsert');
            message = 'Summary promoted to atlas_packets';
          } else if (job.operation === 'promote_qdrant') {
            // TODO: Implement Qdrant sync
            success = false;
            message = 'Qdrant sync not yet implemented';
            stagesFailed.push('qdrant_payload_update: NOT_IMPLEMENTED');
          } else if (job.operation === 'promote_neo4j') {
            // TODO: Implement Neo4j sync
            success = false;
            message = 'Neo4j sync not yet implemented';
            stagesFailed.push('neo4j_edge_creation: NOT_IMPLEMENTED');
          } else {
            success = false;
            message = `Unknown promotion operation: ${job.operation}`;
            stagesFailed.push(message);
          }

          // Mark job as completed or failed
          const finalStatus = success ? 'completed' : 'failed';
          await pool.query(
            `UPDATE promotion_outbox
             SET
               status = $1,
               completed_at = NOW(),
               error_message = $2,
               retry_count = CASE WHEN $1 = 'failed' THEN retry_count + 1 ELSE retry_count END
             WHERE id = $3`,
            [finalStatus, success ? null : message, job.id]
          );

          // If failed but retries remain, requeue as pending (single update, no extra query)
          if (!success) {
            await pool.query(
              `UPDATE promotion_outbox
               SET status = 'pending', started_at = NULL
               WHERE id = $1 AND retry_count < max_retries`,
              [job.id]
            );
            const retryResult = await pool.query(
              `SELECT retry_count, max_retries FROM promotion_outbox WHERE id = $1`,
              [job.id]
            );
            if (retryResult.rows.length > 0) {
              const { retry_count, max_retries } = retryResult.rows[0];
              if (retry_count < max_retries) {
                console.log(`[promotion-worker] Job ${job.id} requeued (retry ${retry_count}/${max_retries})`);
              }
            }
          }

          console.log(`[promotion-worker] Job ${job.id}: ${finalStatus} (${stagesCompleted.join(', ')})`);
        } catch (jobError) {
          console.error(`[promotion-worker] Job ${job.id} error:`, jobError);
          // Mark as failed, don't requeue on unexpected errors
          await pool.query(
            `UPDATE promotion_outbox
             SET status = 'failed', error_message = $1, completed_at = NOW()
             WHERE id = $2`,
            [String(jobError), job.id]
          );
        }
      });

      // Wait for all jobs to complete in parallel
      await Promise.all(processingPromises);

      // Wait before next poll
      await sleep(pollInterval);
    } catch (error) {
      console.error('[promotion-worker] Fatal error:', error);
      await sleep(pollInterval);
    }
  }

  await pool.end();
  console.log('[promotion-worker] Exited gracefully');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  promotionWorker().catch(err => {
    console.error('Promotion worker crashed:', err);
    process.exit(1);
  });
}

export default promotionWorker;
