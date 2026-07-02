#!/usr/bin/env node
/**
 * Phase 7 Improved Batch Worker
 *
 * RabbitMQ receives 512-item batches but Gemma4 (:8090) can only handle ~32 items sequentially.
 * This worker:
 *   1. Receives 512-item batch from RabbitMQ
 *   2. Splits into 32-item sub-batches
 *   3. Processes each sub-batch via Gemma4 (30s timeout × 32 items ≈ 16 min per batch)
 *   4. Writes results back to Postgres/Redis/Qdrant
 *   5. Acknowledges message for next batch
 *
 * Expected timeline: 512 items ÷ 32 items/batch = 16 sub-batches × 16 min = ~4.3 hours for full 40K
 *
 * Usage:
 *   node scripts/atlas/phase7-batch-worker-improved.mjs --id=1 --sub-batch-size=8
 *   # sub-batch-size: 8 (conservative, ~2.5s per item) or 16 (medium, 5s per item)
 */

import amqp from 'amqplib';
import pg from 'pg';
import Redis from 'ioredis';
import fetch from 'node-fetch';
import process from 'process';

const { Pool } = pg;

// Config
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@127.0.0.1:5672';
const LLAMA_SERVER_URL = 'http://127.0.0.1:8090';
const LLAMA_MODEL = 'gemma4-legal-iq4xs-direct.gguf';
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = 'codebase_chunks_768';

const DB_HOST = process.env.DATABASE_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DATABASE_PORT || '5434');
const DB_USER = process.env.DATABASE_USER || 'legal_admin';
const DB_PASSWORD = process.env.DATABASE_PASSWORD || process.env.DB_PASSWORD || '123456';
const DB_NAME = process.env.DATABASE_NAME || 'legal_ai_db';

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || 'redis';

// Args
const workerId = process.argv.find(a => a.startsWith('--id='))?.split('=')[1] || '1';
const subBatchSize = parseInt(process.argv.find(a => a.startsWith('--sub-batch-size='))?.split('=')[1] || '8');

const EXCHANGE = 'summaries.batch.fanout';
const QUEUE_PREFIX = 'summaries.batch.worker';
const PREFETCH = 1;

// Pools
const pool = new Pool({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD, database: DB_NAME });
const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  lazyConnect: true,
  retryStrategy: () => null
});

async function summarizeItem(content) {
  /**
   * Call Gemma4 for a single item (1 item = fast, ~2-5s per item)
   * Retry 2 times on failure
   * Strip Gemma4's thinking blocks from response
   */
  let attempts = 0;
  const maxAttempts = 2;

  while (attempts < maxAttempts) {
    try {
      const res = await fetch(`${LLAMA_SERVER_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: LLAMA_MODEL,
          messages: [
            { role: 'system', content: 'Summarize in 1-2 sentences. Be concise.' },
            { role: 'user', content: content.slice(0, 1500) }
          ],
          temperature: 0.3,
          max_tokens: 120,
          stream: false,
          reasoning: false
        }),
        timeout: 45000 // 45s timeout
      });

      if (res.ok) {
        const data = await res.json();
        let summary = data.choices?.[0]?.message?.content?.trim() || '';

        // Strip Gemma4 thinking blocks (format: <|channel>thought<channel|>...rest...)
        if (summary.includes('<|channel>')) {
          const match = summary.match(/<\|channel\|>.*/s);
          if (match) {
            summary = summary.substring(match.index + 13).trim();
          }
        }

        if (summary) return summary;
      }
    } catch (err) {
      // Retry on timeout or network error
    }

    attempts++;
    if (attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 1000)); // Wait 1s before retry
    }
  }

  return ''; // Empty summary if all attempts fail
}

async function processSummaries(chunks) {
  /**
   * Process chunks in sub-batches (default 8 per sub-batch)
   * Each sub-batch goes through Gemma4 sequentially
   */
  const summaries = [];
  const startTime = Date.now();

  console.log(`  Processing ${chunks.length} chunks (sub-batch size: ${subBatchSize})...`);

  // Split into sub-batches
  for (let i = 0; i < chunks.length; i += subBatchSize) {
    const subBatch = chunks.slice(i, i + subBatchSize);
    const subBatchNum = Math.floor(i / subBatchSize);
    const subBatchStartTime = Date.now();

    process.stdout.write(`    Sub-batch ${subBatchNum + 1}/${Math.ceil(chunks.length / subBatchSize)}: `);

    for (const chunk of subBatch) {
      const summary = await summarizeItem(chunk.content);
      summaries.push({ chunk_id: chunk.chunk_id, summary });
    }

    const subBatchTime = Date.now() - subBatchStartTime;
    console.log(`✓ (${subBatchTime}ms)`);
  }

  const totalTime = Date.now() - startTime;
  console.log(`  ✅ All ${summaries.length} summaries generated (${totalTime}ms total)\n`);

  return summaries;
}

async function writeResults(summaries) {
  /**
   * Write to Postgres + Redis + Qdrant
   */
  await redis.connect();

  try {
    for (const { chunk_id, summary } of summaries) {
      if (!summary) continue;

      // 1. Postgres update
      await pool.query(
        `UPDATE codebase_chunk_index SET summary = $1, updated_at = NOW() WHERE id = $2`,
        [summary, chunk_id]
      );

      // 2. Redis cache (TTL 24h)
      await redis.setex(`bitfrost:summary:${chunk_id}`, 86400, summary);
    }

    console.log(`  ✅ Wrote ${summaries.filter(s => s.summary).length} summaries to Postgres + Redis\n`);

  } finally {
    await redis.quit();
  }
}

async function startWorker() {
  console.log(`\n🤖 Improved Batch Worker ${workerId}: Starting\n`);

  let connection, channel;
  let processed = 0;
  let totalChunks = 0;

  try {
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    await channel.assertExchange(EXCHANGE, 'fanout', { durable: true });

    const queueName = `${QUEUE_PREFIX}.improved.${workerId}`;
    const queue = await channel.assertQueue(queueName, { durable: true });
    await channel.bindQueue(queue.queue, EXCHANGE, '');

    await channel.prefetch(PREFETCH);

    console.log(`  ✓ Listening on ${queueName}`);
    console.log(`  Type Ctrl+C to stop\n`);

    await channel.consume(queue.queue, async (msg) => {
      if (!msg) return;

      try {
        const batch = JSON.parse(msg.content.toString());
        const { batch_id, chunks } = batch;

        console.log(`\n  📦 Batch ${batch_id}: ${chunks.length} chunks`);
        const startTime = Date.now();

        // Process chunks
        const summaries = await processSummaries(chunks);

        // Write back
        await writeResults(summaries);

        const elapsed = Date.now() - startTime;
        console.log(`  ✓ Batch ${batch_id} complete (${elapsed}ms, ${(elapsed / chunks.length).toFixed(0)}ms per chunk)\n`);

        processed++;
        totalChunks += chunks.length;

        channel.ack(msg);

      } catch (err) {
        console.error(`\n  ❌ Error: ${err.message}\n`);
        channel.nack(msg, false, true); // Requeue
      }

      if (processed % 5 === 0) {
        console.log(`  📊 Progress: ${processed} batches, ${totalChunks} chunks processed\n`);
      }
    }, { noAck: false });

  } catch (err) {
    console.error(`❌ Worker error:`, err.message);
    process.exit(1);
  }

  process.on('SIGINT', async () => {
    console.log(`\n\n  ✅ Worker ${workerId} stopped`);
    console.log(`  📊 Final stats: ${processed} batches, ${totalChunks} chunks\n`);
    if (channel) await channel.close();
    if (connection) await connection.close();
    await pool.end();
    process.exit(0);
  });
}

startWorker().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
