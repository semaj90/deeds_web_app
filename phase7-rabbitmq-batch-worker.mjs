#!/usr/bin/env node
/**
 * Phase 7: RabbitMQ-Backed Batch Worker
 *
 * Architecture:
 *   - RabbitMQ queues 32-item micro-batches (fits Gemma4 limits)
 *   - N parallel workers consume and summarize (1 worker per CPU core)
 *   - Each worker calls Gemma4 sequentially within its batch
 *   - Write-back: Postgres + Redis/BitFrost (idempotent)
 *   - Progress tracking: RabbitMQ queue depth, per-worker metrics
 *
 * Expected throughput:
 *   - Single Gemma4 @ 2-5s per item
 *   - 32-item batch = 64-160s per worker
 *   - 4 parallel workers = 64-160s to process 128 items
 *   - 40K items ÷ 128 per cycle = ~312 cycles = ~5-8 hours with 4 workers
 *
 * Usage:
 *   node phase7-rabbitmq-batch-worker.mjs --produce --chunk-batch-size=1000
 *   node phase7-rabbitmq-batch-worker.mjs --worker --id=1 --queue-batch-size=32
 *   node phase7-rabbitmq-batch-worker.mjs --worker --id=2 --queue-batch-size=32
 *   node phase7-rabbitmq-batch-worker.mjs --monitor
 */

import amqp from 'amqplib';
import pg from 'pg';
import Redis from 'ioredis';
import fetch from 'node-fetch';
import { isUsableGemma4Summary, sanitizeGemma4Summary } from './scripts/atlas/lib/gemma4-summary-sanitizer.mjs';

const { Pool } = pg;

// Config
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@127.0.0.1:5672';
const GEMMA4_URL = 'http://127.0.0.1:8090';
const GEMMA4_MODEL = 'gemma4-legal-iq4xs-direct.gguf';

const DB_HOST = process.env.DATABASE_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DATABASE_PORT || '5434');
const DB_USER = process.env.DATABASE_USER || 'legal_admin';
const DB_PASSWORD = process.env.DATABASE_PASSWORD || '123456';
const DB_NAME = process.env.DATABASE_NAME || 'legal_ai_db';

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || 'redis';

// Args
const mode = process.argv[2];
const workerId = process.argv.find(a => a.startsWith('--id='))?.split('=')[1] || '1';
const chunkBatchSize = parseInt(process.argv.find(a => a.startsWith('--chunk-batch-size='))?.split('=')[1] || '1000');
const queueBatchSize = parseInt(process.argv.find(a => a.startsWith('--queue-batch-size='))?.split('=')[1] || '32');

const QUEUE_NAME = process.env.PHASE7_SUMMARY_QUEUE || `phase7.summarization.batch${queueBatchSize}`;
const DLQ_NAME = `${QUEUE_NAME}.dlq`;
const MAX_RETRIES = parseInt(process.env.PHASE7_MAX_RETRIES || '3');

const pool = new Pool({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD, database: DB_NAME });
const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  lazyConnect: true,
  retryStrategy: () => null
});

async function summarizeOne(chunkId, content, cacheKey) {
  // L1: Check BitFrost cache first (5ms) — use relative_path as stable cache key for source_ref linkage
  const redisKey = `bitfrost:summary:${cacheKey}`;
  try {
    const cached = await redis.get(redisKey);
    if (cached) {
      const sanitized = sanitizeGemma4Summary(cached);
      if (isUsableGemma4Summary(sanitized.summary, { minLength: 30, minUniqueWords: 6 })) {
        if (sanitized.changed) {
          await redis.setex(redisKey, 86400, sanitized.summary);
        }
        return sanitized.summary;
      }
      await redis.del(redisKey);
    }
  } catch (err) {
    // Cache miss, proceed to Gemma4
  }

  // L2: Call Gemma4 (2-5s)
  try {
    const res = await fetch(`${GEMMA4_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GEMMA4_MODEL,
        messages: [
          { role: 'system', content: 'Summarize in 1-2 sentences. Be concise.' },
          { role: 'user', content: content.slice(0, 1500) }
        ],
        temperature: 0.3,
        max_tokens: 120,
        stream: false,
        reasoning: false,
        cache_prompt: true  // Enable KV cache for system prompt reuse
      }),
      signal: AbortSignal.timeout(45000)
    });

    if (!res.ok) return null;

    const data = await res.json();
    const sanitized = sanitizeGemma4Summary(data.choices?.[0]?.message?.content ?? '');
    const summary = sanitized.summary;
    if (!isUsableGemma4Summary(summary, { minLength: 30, minUniqueWords: 6 })) {
      return null;
    }

    // Cache summary using the same key that was checked in L1 (lines 68-71)
    if (summary && cacheKey) {
      try {
        await redis.setex(`bitfrost:summary:${cacheKey}`, 86400, summary);
      } catch (err) {
        // Ignore cache write errors
      }
    }

    return summary || null;
  } catch (err) {
    return null;
  }
}

async function produceQueue() {
  console.log(`\n📤 Producer: Enqueuing ${chunkBatchSize}-item chunks into ${queueBatchSize}-item micro-batches\n`);

  let connection, channel;

  try {
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    await channel.assertQueue(QUEUE_NAME, { durable: true });
    await channel.assertQueue(DLQ_NAME, { durable: true });

    // Fetch unsummarized chunks with relative_path as stable cache key
    const result = await pool.query(`
      SELECT id, relative_path, content
      FROM codebase_chunk_index
      WHERE summary IS NULL OR summary = ''
      ORDER BY id
      LIMIT $1
    `, [chunkBatchSize]);

    const chunks = result.rows;
    console.log(`  Found ${chunks.length} unsummarized chunks\n`);

    let enqueued = 0;

    // Split into micro-batches and enqueue
    for (let i = 0; i < chunks.length; i += queueBatchSize) {
      const batch = chunks.slice(i, i + queueBatchSize);
      const message = {
        batch_id: Math.floor(i / queueBatchSize),
        chunks: batch.map(c => ({ id: c.id, path: c.relative_path, content: c.content, cacheKey: c.relative_path }))
      };

      channel.sendToQueue(
        QUEUE_NAME,
        Buffer.from(JSON.stringify(message)),
        { persistent: true, contentType: 'application/json' }
      );

      enqueued++;

      if (enqueued % 50 === 0) {
        console.log(`  ✓ Enqueued ${enqueued} micro-batches (${i + queueBatchSize}/${chunks.length} chunks)`);
      }
    }

    console.log(`\n  ✅ Enqueued ${enqueued} micro-batches of ${queueBatchSize} items\n`);

  } catch (err) {
    console.error('Producer error:', err.message);
    process.exit(1);
  } finally {
    if (channel) await channel.close();
    if (connection) await connection.close();
    await pool.end();
  }
}

async function startWorker() {
  console.log(`\n🤖 Worker ${workerId}: Starting (queue batch size: ${queueBatchSize})\n`);

  let connection, channel;
  let processed = 0;
  let summarized = 0;

  try {
    await redis.connect();
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    await channel.assertQueue(QUEUE_NAME, { durable: true });
    await channel.assertQueue(DLQ_NAME, { durable: true });

    await channel.prefetch(1);

    console.log(`  ✓ Listening on ${QUEUE_NAME}`);
    console.log(`  Type Ctrl+C to stop\n`);

    await channel.consume(QUEUE_NAME, async (msg) => {
      if (!msg) return;

      try {
        const batch = JSON.parse(msg.content.toString());
        const { batch_id, chunks } = batch;

        console.log(`  📦 Batch ${batch_id}: ${chunks.length} chunks`);
        const batchStart = Date.now();

        // Process each chunk in the batch
        for (const chunk of chunks) {
          const summary = await summarizeOne(chunk.id, chunk.content, chunk.cacheKey);

          if (summary) {
            // Write to Postgres (canonical)
            await pool.query(
              `UPDATE codebase_chunk_index
               SET summary = $1, updated_at = NOW()
               WHERE id = $2
                 AND (summary IS NULL OR btrim(summary) = '')`,
              [summary, chunk.id]
            );

            // Redis caching done in summarizeOne() using relative_path-based key
            summarized++;
          }
        }

        const elapsed = Date.now() - batchStart;
        console.log(`    ✓ ${chunks.length} chunks processed (${elapsed}ms, ${(elapsed / chunks.length).toFixed(0)}ms each)`);

        processed++;
        channel.ack(msg);

        if (processed % 10 === 0) {
          console.log(`  📊 Worker ${workerId}: ${processed} batches, ${summarized} summaries written\n`);
        }

      } catch (err) {
        console.error(`  ❌ Error: ${err.message}`);
        const headers = msg.properties.headers || {};
        const retryCount = Number(headers['x-retry-count'] || 0);
        if (retryCount >= MAX_RETRIES) {
          channel.sendToQueue(DLQ_NAME, msg.content, {
            persistent: true,
            contentType: msg.properties.contentType || 'application/json',
            headers: {
              ...headers,
              'x-retry-count': retryCount,
              'x-dead-letter-reason': err.message,
              'x-dead-lettered-at': new Date().toISOString(),
            },
          });
          channel.ack(msg);
        } else {
          channel.sendToQueue(QUEUE_NAME, msg.content, {
            persistent: true,
            contentType: msg.properties.contentType || 'application/json',
            headers: {
              ...headers,
              'x-retry-count': retryCount + 1,
              'x-last-error': err.message,
            },
          });
          channel.ack(msg);
        }
      }
    }, { noAck: false });

  } catch (err) {
    console.error('Worker error:', err.message);
    process.exit(1);
  }

  process.on('SIGINT', async () => {
    console.log(`\n\n  ✅ Worker ${workerId} stopped`);
    console.log(`  📊 Stats: ${processed} batches, ${summarized} summaries\n`);
    if (channel) await channel.close();
    if (connection) await connection.close();
    await redis.quit();
    await pool.end();
    process.exit(0);
  });
}

async function monitorProgress() {
  console.log(`\n📊 Phase 7 Progress Monitor\n`);

  try {
    const [queueStats, dbStats] = await Promise.all([
      (async () => {
        const conn = await amqp.connect(RABBITMQ_URL);
        const chan = await conn.createChannel();
        await chan.assertQueue(QUEUE_NAME);
        const q = await chan.checkQueue(QUEUE_NAME);
        await chan.close();
        await conn.close();
        return q;
      })(),
      pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(summary) FILTER (WHERE summary IS NOT NULL AND summary != '') as summarized,
          COUNT(*) FILTER (WHERE summary IS NULL OR summary = '') as remaining
        FROM codebase_chunk_index
      `)
    ]);

    const { total, summarized, remaining } = dbStats.rows[0];
    const pct = Math.round((summarized / total) * 100);
    const queueDepth = queueStats.messageCount || 0;

    console.log(`  📈 Postgres: ${summarized}/${total} summarized (${pct}%)`);
    console.log(`  📋 RabbitMQ queue: ${queueDepth} messages pending`);
    console.log(`  ⏱️  Remaining: ${remaining} chunks\n`);

  } catch (err) {
    console.error('Monitor error:', err.message);
  } finally {
    await pool.end();
  }
}

if (!mode) {
  console.error(`\nUsage:`);
  console.error(`  node phase7-rabbitmq-batch-worker.mjs --produce [--chunk-batch-size=1000]`);
  console.error(`  node phase7-rabbitmq-batch-worker.mjs --worker --id=1 [--queue-batch-size=32]`);
  console.error(`  node phase7-rabbitmq-batch-worker.mjs --monitor\n`);
  process.exit(1);
}

if (mode === '--produce') {
  produceQueue();
} else if (mode === '--worker') {
  startWorker();
} else if (mode === '--monitor') {
  monitorProgress();
}
