#!/usr/bin/env node
/**
 * Phase 10b: RabbitMQ Tool Telemetry Consumer
 *
 * Task Group 3 — Activates the telemetry feedback loop
 *
 * Flow:
 * 1. Listen on RabbitMQ 'tool.telemetry' queue
 * 2. Parse tool execution events (tool_id, query, success, latency_ms, error_type)
 * 3. Write to tool_execution_log (Postgres canonical truth)
 * 4. Trigger materialized view refresh (via separate queue or scheduled)
 * 5. tool_registry rolling_success_rate_7d updated on refresh
 * 6. HMM selector gets fresh feedback for learned routing
 *
 * Event shape (from selectTool() emitter):
 * {
 *   tool_id: string,           // e.g., "api:retrieval.unified" or "trace.kag_search"
 *   query: string,             // user query or operation description
 *   success: 0 | 1,            // 1 = success, 0 = failure
 *   latency_ms: number,        // execution time in milliseconds
 *   error_type?: string,       // "timeout" | "schema_mismatch" | "api_failure" | "rate_limit" | "unknown"
 *   timestamp?: ISO8601        // will default to NOW() if omitted
 * }
 */

import amqplib from 'amqplib';
import pg from 'pg';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const QUEUE_NAME = 'tool.telemetry';
const QUEUE_STATS_TRIGGER = 'tool.telemetry.stats.refresh';

let connection = null;
let channel = null;
let pool = null;

// Stats tracking
let stats = {
  messagesProcessed: 0,
  eventsLogged: 0,
  errorsEncountered: 0,
  startTime: Date.now()
};

/**
 * Connect to PostgreSQL
 */
async function connectDb() {
  pool = new pg.Pool({ connectionString: DATABASE_URL });
  try {
    await pool.query('SELECT NOW()');
    console.log('✅ PostgreSQL connected');
    return true;
  } catch (error) {
    console.error('❌ PostgreSQL connection failed:', error.message);
    return false;
  }
}

/**
 * Connect to RabbitMQ and setup queues
 */
async function connectRabbitMq() {
  try {
    connection = await amqplib.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    // Assert queues (idempotent)
    await channel.assertQueue(QUEUE_NAME, { durable: true });
    await channel.assertQueue(QUEUE_STATS_TRIGGER, { durable: true });

    console.log(`✅ RabbitMQ connected`);
    console.log(`   Queue: ${QUEUE_NAME} (durable)`);
    console.log(`   Stats queue: ${QUEUE_STATS_TRIGGER} (for refresh triggers)`);

    return true;
  } catch (error) {
    console.error('❌ RabbitMQ connection failed:', error.message);
    return false;
  }
}

/**
 * Process a single telemetry event
 */
async function processEvent(event) {
  stats.messagesProcessed++;

  try {
    // Validate event shape
    if (!event.tool_id || typeof event.success !== 'number') {
      console.error(`⚠️  Invalid event shape (missing tool_id or success):`, event);
      stats.errorsEncountered++;
      return false;
    }

    // Extract fields with defaults
    const {
      tool_id,
      query = null,
      success,
      latency_ms = null,
      error_type = null,
      timestamp = new Date().toISOString()
    } = event;

    // Insert into tool_execution_log
    const result = await pool.query(
      `INSERT INTO tool_execution_log (tool_id, query, success, latency_ms, error_type, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [tool_id, query, success, latency_ms, error_type, timestamp]
    );

    stats.eventsLogged++;

    if (stats.eventsLogged % 50 === 0) {
      console.log(`   Logged ${stats.eventsLogged} events`);
    }

    return result.rows[0].id;
  } catch (error) {
    console.error(`❌ Failed to log event for tool ${event.tool_id}:`, error.message);
    stats.errorsEncountered++;
    return false;
  }
}

/**
 * Trigger materialized view refresh via separate queue
 */
async function triggerStatsRefresh() {
  try {
    // Publish a refresh trigger message
    channel.sendToQueue(
      QUEUE_STATS_TRIGGER,
      Buffer.from(JSON.stringify({
        action: 'refresh_view',
        timestamp: new Date().toISOString(),
        reason: 'telemetry_batch_processed'
      })),
      { persistent: true }
    );
  } catch (error) {
    console.error('⚠️  Failed to trigger stats refresh:', error.message);
  }
}

/**
 * Consumer message handler
 */
async function handleMessage(msg) {
  if (!msg) return;

  try {
    const content = msg.content.toString();
    const event = JSON.parse(content);

    // Process the event
    const logId = await processEvent(event);

    if (logId) {
      // Acknowledge only after successful processing
      channel.ack(msg);

      // Periodically trigger stats refresh
      if (stats.eventsLogged % 100 === 0) {
        await triggerStatsRefresh();
      }
    } else {
      // Nack and requeue on error
      channel.nack(msg, false, true);
    }
  } catch (error) {
    console.error('❌ Message handler error:', error.message);
    stats.errorsEncountered++;
    // Nack and requeue
    channel.nack(msg, false, true);
  }
}

/**
 * Start consuming messages
 */
async function startConsuming() {
  console.log('');
  console.log('🎧 Starting telemetry consumer...');

  try {
    // Prefetch 1 message at a time for fair distribution
    await channel.prefetch(1);

    // Start consuming
    await channel.consume(QUEUE_NAME, handleMessage, { noAck: false });

    console.log(`✅ Consumer listening on '${QUEUE_NAME}'`);
    console.log('   Waiting for events...');
    console.log('');
  } catch (error) {
    console.error('❌ Failed to start consuming:', error.message);
    await cleanup();
    process.exit(1);
  }
}

/**
 * Print periodic statistics
 */
function printStats() {
  const uptime = Math.floor((Date.now() - stats.startTime) / 1000);
  const rate = stats.eventsLogged / (uptime / 60); // events per minute

  console.log(`📊 Stats (${uptime}s uptime):`);
  console.log(`   Events processed: ${stats.messagesProcessed}`);
  console.log(`   Events logged: ${stats.eventsLogged}`);
  console.log(`   Errors: ${stats.errorsEncountered}`);
  console.log(`   Rate: ${rate.toFixed(1)} events/min`);
}

/**
 * Graceful shutdown
 */
async function cleanup() {
  console.log('');
  console.log('🛑 Shutting down...');

  printStats();

  if (channel) {
    try {
      await channel.close();
      console.log('✅ RabbitMQ channel closed');
    } catch (e) {
      // ignore
    }
  }

  if (connection) {
    try {
      await connection.close();
      console.log('✅ RabbitMQ connection closed');
    } catch (e) {
      // ignore
    }
  }

  if (pool) {
    try {
      await pool.end();
      console.log('✅ PostgreSQL pool closed');
    } catch (e) {
      // ignore
    }
  }

  console.log('✨ Shutdown complete');
  process.exit(0);
}

/**
 * Handle signals
 */
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

/**
 * Main entry point
 */
async function main() {
  console.log('🚀 Phase 10b: Tool Telemetry Consumer');
  console.log('');

  // Connect to databases
  const dbOk = await connectDb();
  if (!dbOk) {
    process.exit(1);
  }

  const mqOk = await connectRabbitMq();
  if (!mqOk) {
    process.exit(1);
  }

  // Start consuming
  await startConsuming();

  // Print stats every 60 seconds
  setInterval(printStats, 60000);
}

main().catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});
