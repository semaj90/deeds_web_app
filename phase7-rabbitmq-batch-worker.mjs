#!/usr/bin/env node
/**
 * Phase 7: RabbitMQ-Backed Batch Worker
 *
 * Architecture:
 *   - RabbitMQ queues 32-item micro-batches (fits Gemma4 limits)
 *   - N parallel workers consume and summarize (1 worker per CPU core)
 *   - Each worker calls Gemma4 sequentially within its batch
 *   - Write-back: Postgres + Redis + Qdrant (idempotent)
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

const EXCHANGE = 'phase7.summaries';
const QUEUE_NAME = `phase7.batch.${queueBatchSize}`;
const WORKER_QUEUE = `${QUEUE_NAME}.worker.${workerId}`;

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
    if (cached) return cached;
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
      timeout: 45000
    });

    if (!res.ok) return null;

    const data = await res.json();
    let summary = data.choices?.[0]?.message?.content?.trim() || '';

    // Strip Gemma4 thinking block markers (can appear mid-summary or wrapped)
    summary = summary.replace(/<\|channel\>thought<channel\|>/g, '')
                     .replace(/<\|endthinking\>/g, '')
                     .replace(/<\|thinking\>/g, '')
                     .replace(/<thinking>[\s\S]*?<\/thinking>/g, '');

    // Filter out meta-commentary lines (Gemma4 preambles)
    const lines = summary.split('\n').map(l => l.trim()).filter(line => {
      if (!line) return false;

      // Meta-commentary patterns (case-insensitive)
      if (line.match(/^(here'?s|here'?is)\s+a\s+(thinking|summary|breakdown)/i)) return false;
      if (line.match(/^(the\s+)?(user\s+)?(wants|is\s+asking|is\s+looking|wants\s+a)/i)) return false;
      if (line.match(/^(the|this)\s+(user|code|snippet|object|component)\s+/i)) return false;
      if (line.match(/^(plan|summary|note|important|note:|key:|what|when|where|why|how|output):/i)) return false;
      if (line.match(/^(1|2|3)\.\s+(identify|analyze|break|define|note|step)/i)) return false;
      if (line.match(/^(1|2|3)\.\s+\*\*/)) return false;
      if (line.match(/^(defines|exports|imports|contains|implements|describes):/i)) return false;

      return true;
    });

    summary = lines.join('\n').trim();

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

    await channel.assertExchange(EXCHANGE, 'fanout', { durable: true });
    await channel.assertQueue(QUEUE_NAME, { durable: true });
    await channel.bindQueue(QUEUE_NAME, EXCHANGE, '');

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

      channel.publish(
        EXCHANGE,
        '',
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

    await channel.assertExchange(EXCHANGE, 'fanout', { durable: true });
    await channel.assertQueue(QUEUE_NAME, { durable: true });
    await channel.bindQueue(QUEUE_NAME, EXCHANGE, '');

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
              `UPDATE codebase_chunk_index SET summary = $1, updated_at = NOW() WHERE id = $2`,
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
        channel.nack(msg, false, true); // Requeue
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
