#!/usr/bin/env node
/**
 * Phase 7 Auto-Refill: Monitor queue depth + validate summary quality
 *
 * Triggers auto-refill when:
 *   1. Queue drops below REFILL_THRESHOLD (200 msgs)
 *   2. Last N summaries pass contamination check (VALIDATION_SAMPLE_SIZE)
 *   3. No DLQ errors (workers healthy)
 *
 * Refill: --batch=500 --limit=2000 (bounded, safe)
 *
 * Run: node scripts/phase7-auto-refill.mjs
 */

import amqp from 'amqplib';
import pg from 'pg';
import fetch from 'node-fetch';

const { Pool } = pg;

// === CONFIG ===
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@127.0.0.1:5672';
const QUEUE_NAME = 'phase7.summarization';
const DLQ_NAME = `${QUEUE_NAME}.dlq`;
const REFILL_THRESHOLD = 200;
const CHECK_INTERVAL_MS = 30_000; // Check every 30s
const VALIDATION_SAMPLE_SIZE = 20; // Check last 20 summaries for contamination
const CONTAMINATION_PATTERNS = [
  /<end_of_turn>/i,
  /<start_of_turn>/i,
  /<\|channel>/i,
  /<\|endthinking\|?>/i,
  /<\/?thinking>/i
];

// Postgres pool
const pool = new Pool({
  host: process.env.DATABASE_HOST || '127.0.0.1',
  port: parseInt(process.env.DATABASE_PORT || '5434'),
  user: process.env.DATABASE_USER || 'legal_admin',
  password: process.env.DATABASE_PASSWORD || '123456',
  database: process.env.DATABASE_NAME || 'legal_ai_db'
});

// === VALIDATION ===
async function validateRecentSummaries() {
  try {
    const result = await pool.query(`
      SELECT
        summary,
        updated_at
      FROM codebase_chunk_index
      WHERE summary IS NOT NULL AND LENGTH(summary) > 0
      ORDER BY updated_at DESC
      LIMIT $1;
    `, [VALIDATION_SAMPLE_SIZE]);

    let contaminatedCount = 0;
    for (const row of result.rows) {
      for (const pattern of CONTAMINATION_PATTERNS) {
        if (pattern.test(row.summary)) {
          contaminatedCount++;
          console.warn(`⚠️ Contamination detected in summary from ${row.updated_at}: ${pattern}`);
          break;
        }
      }
    }

    const cleanRate = ((result.rows.length - contaminatedCount) / result.rows.length) * 100;
    console.log(`✅ Validation: ${result.rows.length} recent summaries, ${cleanRate.toFixed(1)}% clean`);

    return cleanRate >= 95; // Pass if 95%+ clean
  } catch (err) {
    console.error(`❌ Validation failed: ${err.message}`);
    return false;
  }
}

// === QUEUE STATUS ===
async function getQueueStatus(channel) {
  try {
    const queueInfo = await channel.checkQueue(QUEUE_NAME);
    const dlqInfo = await channel.checkQueue(DLQ_NAME);

    return {
      messages: queueInfo.messageCount,
      consumers: queueInfo.consumerCount,
      dlq: dlqInfo.messageCount,
      healthy: dlqInfo.messageCount === 0 && queueInfo.consumerCount > 0
    };
  } catch (err) {
    console.error(`❌ Queue status check failed: ${err.message}`);
    return null;
  }
}

// === AUTO-REFILL ===
async function refillQueue(channel) {
  try {
    console.log('🔄 Starting auto-refill: --batch=500 --limit=2000');

    // Enqueue 500 unsummarized chunks (limit to 2000 total messages in flight)
    const result = await pool.query(`
      SELECT id, content
      FROM codebase_chunk_index
      WHERE summary IS NULL OR LENGTH(summary) = 0
      LIMIT 500;
    `);

    let published = 0;
    for (const chunk of result.rows) {
      const payload = JSON.stringify({
        chunk_id: chunk.id,
        content: chunk.content
      });

      channel.sendToQueue(QUEUE_NAME, Buffer.from(payload), { persistent: true });
      published++;
    }

    console.log(`✅ Published ${published} messages to ${QUEUE_NAME}`);
    return published;
  } catch (err) {
    console.error(`❌ Refill failed: ${err.message}`);
    return 0;
  }
}

// === MAIN LOOP ===
async function monitor() {
  let connection, channel;
  let lastRefillTime = 0;
  const MIN_REFILL_INTERVAL_MS = 300_000; // Don't refill more than once per 5 min

  try {
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    console.log('✅ Connected to RabbitMQ');
    console.log(`📊 Monitoring ${QUEUE_NAME} (refill at ${REFILL_THRESHOLD} msgs)`);

    while (true) {
      try {
        const status = await getQueueStatus(channel);

        if (!status) {
          console.error('⚠️ Could not get queue status, retrying...');
          await new Promise(r => setTimeout(r, CHECK_INTERVAL_MS));
          continue;
        }

        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] Queue: ${status.messages} msgs | Consumers: ${status.consumers} | DLQ: ${status.dlq}`);

        // === REFILL TRIGGER ===
        if (
          status.messages < REFILL_THRESHOLD &&
          status.healthy &&
          Date.now() - lastRefillTime > MIN_REFILL_INTERVAL_MS
        ) {
          console.log(`⚠️ Queue below threshold (${status.messages} < ${REFILL_THRESHOLD})`);

          // Validate before refill
          const isClean = await validateRecentSummaries();
          if (!isClean) {
            console.error('❌ Validation failed: summaries contaminated. Pausing auto-refill.');
            console.error('⚠️ Manual review required. Run: docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT * FROM codebase_chunk_index WHERE summary LIKE \'%<end_of_turn>%\' LIMIT 5;"');
            await new Promise(r => setTimeout(r, CHECK_INTERVAL_MS * 2)); // Wait longer before retry
            continue;
          }

          const published = await refillQueue(channel);
          if (published > 0) {
            lastRefillTime = Date.now();
            console.log(`✅ Refill complete, next check in ${CHECK_INTERVAL_MS / 1000}s`);
          }
        }

        // === COMPLETION CHECK ===
        if (status.messages === 0 && status.dlq === 0 && status.consumers === 0) {
          console.log('🎉 PHASE 7 COMPLETE: Queue empty, no errors, workers idle');
          console.log('📋 Next: Run Phase 8 pipeline (sanitize → verify → Qdrant sync)');
          break;
        }

      } catch (err) {
        console.error(`❌ Monitor cycle error: ${err.message}`);
      }

      await new Promise(r => setTimeout(r, CHECK_INTERVAL_MS));
    }

  } catch (err) {
    console.error(`❌ Fatal error: ${err.message}`);
    process.exit(1);
  } finally {
    if (channel) await channel.close();
    if (connection) await connection.close();
    await pool.end();
  }
}

// === SIGNAL HANDLERS ===
process.on('SIGINT', async () => {
  console.log('\n✋ Shutting down...');
  process.exit(0);
});

// === START ===
monitor().catch(console.error);
