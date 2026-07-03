#!/usr/bin/env node
/**
 * Phase 7 Speed Test: Parallel LLM with Single Concurrency
 *
 * Setup:
 *   llama-server --parallel 2 (accept 2 concurrent requests)
 *   LLM_CONCURRENCY=1 (process only 1 at a time)
 *   4 workers (local load distribution)
 *
 * Behavior:
 *   - Workers pull from queue with PREFETCH=2 (fair distribution)
 *   - Each request serialized through Gemma4 (LLM_CONCURRENCY=1)
 *   - Auto-requeue when queue < 500 messages
 *   - ACP logging via async console (non-blocking)
 *
 * Run:
 *   node scripts/atlas/phase7-speed-test.mjs --test --workers=4 --duration=5
 */

import amqp from 'amqplib';
import pg from 'pg';
import fetch from 'node-fetch';
import process from 'process';

const { Pool } = pg;

// Config
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@127.0.0.1:5672';
const GEMMA4_URL = process.env.GEMMA4_URL || 'http://127.0.0.1:8090';
const QUEUE_NAME = 'phase7.summarization';
const DLQ_NAME = `${QUEUE_NAME}.dlq`;
const PREFETCH = 2; // Allow 2 messages at a time per worker
const GEMMA4_TIMEOUT_MS = 120000; // 2 min
const AUTO_REQUEUE_THRESHOLD = 500;
const AUTO_REQUEUE_BATCH = 2000;

// Parse args
const testMode = process.argv.includes('--test');
const numWorkers = parseInt(process.argv.find(a => a.startsWith('--workers='))?.split('=')[1] || '4');
const testDurationSec = parseInt(process.argv.find(a => a.startsWith('--duration='))?.split('=')[1] || '5');

// Postgres pool
const pool = new Pool({
  host: process.env.DATABASE_HOST || '127.0.0.1',
  port: parseInt(process.env.DATABASE_PORT || '5434'),
  user: process.env.DATABASE_USER || 'legal_admin',
  password: process.env.DATABASE_PASSWORD || '123456',
  database: process.env.DATABASE_NAME || 'legal_ai_db'
});

// ACP Logger (async, non-blocking)
class AcpLogger {
  constructor(workerId) {
    this.workerId = workerId;
    this.buffer = [];
  }

  async log(level, message, metadata = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      worker_id: this.workerId,
      message,
      ...metadata
    };
    this.buffer.push(entry);

    // Async log (fire and forget)
    setImmediate(() => {
      const json = JSON.stringify(entry);
      if (level === 'ERROR') console.error(`[${this.workerId}] ${json}`);
      else if (level === 'WARN') console.warn(`[${this.workerId}] ${json}`);
      else console.log(`[${this.workerId}] ${json}`);
    });
  }

  async trace(name, duration_ms, success, metadata = {}) {
    await this.log('TRACE', name, { duration_ms, success, ...metadata });
  }
}

// Sanitize summary
function sanitizeSummary(raw) {
  if (!raw) return '';
  let result = raw.split(/<end_of_turn>\s*<start_of_turn>\s*user/i)[0];
  result = result.replace(/<end_of_turn>/gi, '');
  result = result.replace(/<start_of_turn>\s*(user|model|assistant|system)?\s*/gi, '');
  result = result.replace(/<\|channel>/gi, '');
  result = result.replace(/<\|endthinking\|?>/gi, '');
  result = result.replace(/<\/?thinking>/gi, '');
  return result.replace(/\s+/g, ' ').trim();
}

// Generate summary with timing
async function generateSummary(content, logger) {
  const startTime = Date.now();
  try {
    const res = await fetch(`${GEMMA4_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4-legal-iq4xs-direct.gguf',
        messages: [
          { role: 'system', content: 'Summarize in 1-2 sentences.' },
          { role: 'user', content: content.slice(0, 2000) }
        ],
        temperature: 0.3,
        max_tokens: 150,
        stream: false
      }),
      timeout: GEMMA4_TIMEOUT_MS
    });

    if (!res.ok) {
      await logger.log('ERROR', `Gemma4 error: ${res.status}`, { status: res.status });
      return '';
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || '';
    const sanitized = sanitizeSummary(raw);

    const duration = Date.now() - startTime;
    await logger.trace('gemma4_summary', duration, true, {
      raw_len: raw.length,
      sanitized_len: sanitized.length,
      tokens: data.usage?.total_tokens || 0
    });

    return sanitized;
  } catch (err) {
    const duration = Date.now() - startTime;
    await logger.log('ERROR', `Summary generation failed: ${err.message}`, { duration_ms: duration });
    return '';
  }
}

// Worker: Consume queue
async function runWorker(workerId) {
  const logger = new AcpLogger(`worker-${workerId}`);
  let connection, channel;
  let processed = 0, failed = 0;

  try {
    await logger.log('INFO', `Starting worker`, { prefetch: PREFETCH });

    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    // Declare queue and DLQ
    await channel.assertQueue(QUEUE_NAME, { durable: true });
    await channel.assertQueue(DLQ_NAME, { durable: true });
    await channel.prefetch(PREFETCH);

    await logger.log('INFO', `Listening on ${QUEUE_NAME}`);

    // Consume
    await channel.consume(QUEUE_NAME, async (msg) => {
      if (!msg) return;

      const startTime = Date.now();
      try {
        const payload = JSON.parse(msg.content.toString());
        const { chunk_id, content } = payload;

        const summary = await generateSummary(content, logger);

        if (summary) {
          // Write to Postgres
          const updateStart = Date.now();
          await pool.query(
            'UPDATE codebase_chunk_index SET summary = $1, updated_at = NOW() WHERE id = $2',
            [summary, chunk_id]
          );
          const updateDuration = Date.now() - updateStart;

          await logger.trace('postgres_write', updateDuration, true, { summary_len: summary.length });
          processed++;
          channel.ack(msg);
        } else {
          await logger.log('WARN', `Empty summary for chunk`, { chunk_id });
          failed++;
          channel.nack(msg, false, true); // Requeue
        }
      } catch (err) {
        await logger.log('ERROR', `Worker error: ${err.message}`, { chunk_id: msg?.content?.toString?.().slice?.(0, 36) });
        failed++;
        channel.nack(msg, false, true);
      }

      const totalTime = Date.now() - startTime;
      if ((processed + failed) % 10 === 0) {
        await logger.log('STAT', `Progress`, { processed, failed, total_time_ms: totalTime });
      }
    }, { noAck: false });

  } catch (err) {
    await logger.log('ERROR', `Worker fatal error: ${err.message}`);
    process.exit(1);
  }

  process.on('SIGINT', async () => {
    await logger.log('INFO', `Shutting down`, { processed, failed });
    if (channel) await channel.close();
    if (connection) await connection.close();
    await pool.end();
    process.exit(0);
  });
}

// Monitor & auto-requeue
async function monitorQueue() {
  const logger = new AcpLogger('monitor');
  let connection, channel;

  try {
    await logger.log('INFO', 'Queue monitor started');

    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_NAME, { durable: true });

    setInterval(async () => {
      try {
        const q = await channel.checkQueue(QUEUE_NAME);
        await logger.log('STAT', `Queue depth`, { messages: q.messageCount, consumers: q.consumerCount });

        // Auto-requeue if below threshold
        if (q.messageCount < AUTO_REQUEUE_THRESHOLD) {
          await logger.log('INFO', `Auto-requeue triggered`, { current: q.messageCount, threshold: AUTO_REQUEUE_THRESHOLD });
          // This would call the producer here
          // For now, just log
        }
      } catch (err) {
        await logger.log('ERROR', `Monitor check failed: ${err.message}`);
      }
    }, 10000); // Every 10 seconds

  } catch (err) {
    await logger.log('ERROR', `Monitor fatal: ${err.message}`);
  }
}

// Main
async function main() {
  console.log(`\n🏃 Phase 7 Speed Test`);
  console.log(`   Workers: ${numWorkers}`);
  console.log(`   Prefetch: ${PREFETCH}`);
  console.log(`   LLM_CONCURRENCY: 1 (hardcoded in server)\n`);

  if (testMode) {
    // Start monitor
    monitorQueue();

    // Start workers
    for (let i = 1; i <= numWorkers; i++) {
      runWorker(i);
    }

    // Wait for test duration
    await new Promise(r => setTimeout(r, testDurationSec * 1000));
    console.log(`\n✅ Speed test completed`);
  } else {
    console.log(`Usage: node scripts/atlas/phase7-speed-test.mjs --test --workers=4 --duration=5`);
  }
}

main().catch(console.error);
