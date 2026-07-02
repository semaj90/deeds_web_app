#!/usr/bin/env node
/**
 * Phase 7: Batch Inference for Summaries
 *
 * Architecture:
 *   Packet envelope (identity + metadata)
 *     ↓ Postgres
 *   512-packet batches
 *     ↓ RabbitMQ fanout
 *   Batch worker
 *     ↓
 *   Extract content (LangExtract + ast-grep)
 *     ↓
 *   llama-server RotorQuant GGUF (current) OR Triton TensorRT-LLM (future engine)
 *     ↓
 *   bounded summaries
 *     ↓
 *   Write back:
 *     - Postgres codebase_chunk_index.summary
 *     - Qdrant payload update
 *     - Redis cache bitfrost:summary:*
 *
 * Why batching matters:
 *   1 packet @ Gemma4 = high latency, GPU idle between requests
 *   Current model is GGUF under /models, so the supported live backend is
 *   llama-server :8090. Triton requires a converted TensorRT model repository.
 *
 * Usage:
 *   # Start Triton inference server (separate terminal)
 *   docker run --gpus all -p 8000:8000 -p 8001:8001 -p 8002:8002 \
 *     nvcr.io/nvidia/tritonserver:latest
 *
 *   # Start batch producer (enqueue packets)
 *   node scripts/atlas/phase7-triton-batch-summaries.mjs --produce --batch-size=512
 *
 *   # Start batch worker (consume + summarize)
 *   node scripts/atlas/phase7-triton-batch-summaries.mjs --worker --batch-size=512
 *
 *   # Monitor progress
 *   node scripts/atlas/phase7-triton-batch-summaries.mjs --monitor
 */

import amqp from 'amqplib';
import pg from 'pg';
import Redis from 'ioredis';
import fetch from 'node-fetch';
import process from 'process';
import { loadRepoEnv, resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';

const { Pool } = pg;

// Config
const env = loadRepoEnv();
const RABBITMQ_URL = env.RABBITMQ_URL || 'amqp://guest:guest@127.0.0.1:5672';
const TRITON_URL = env.TRITON_URL || 'http://127.0.0.1:8000';
const LLAMA_SERVER_URL = env.LLAMA_SERVER_URL || env.GEMMA4_URL || 'http://127.0.0.1:8090';
const LLAMA_MODEL = env.LLAMA_MODEL || env.GEMMA4_MODEL || 'gemma4-legal-iq4xs-direct.gguf';
const QDRANT_URL = env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = 'codebase_chunks_768';
const DATABASE_URL = resolveDatabaseUrl(env);
const REDIS_HOST = env.REDIS_HOST || env.VALKEY_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(env.REDIS_PORT || env.VALKEY_PORT || '6379');
const REDIS_PASSWORD = env.REDIS_PASSWORD || env.VALKEY_PASSWORD || 'redis';

// Postgres pool
const pool = new Pool({ connectionString: DATABASE_URL });

// Redis client
const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  lazyConnect: true,
  retryStrategy: () => null
});

// Parse args
const mode = process.argv[2];
const batchSize = parseInt(process.argv.find(a => a.startsWith('--batch-size='))?.split('=')[1] || '512');
const workerId = process.argv.find(a => a.startsWith('--id='))?.split('=')[1] || '1';
const limit = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0');
const once = process.argv.includes('--once');
const backend = process.argv.find(a => a.startsWith('--backend='))?.split('=')[1] || env.PHASE7_SUMMARY_BACKEND || 'llama-server';
const allowGemma4Fallback = process.argv.includes('--allow-gemma4-fallback');
const MAX_GEMMA4_FALLBACK_BATCH = parseInt(env.PHASE7_MAX_GEMMA4_FALLBACK_BATCH || '32');
const allowLargeLlamaBatch = process.argv.includes('--allow-large-llama-batch');

const EXCHANGE = 'summaries.batch.fanout';
const QUEUE_PREFIX = 'summaries.batch.worker';
const PREFETCH = 1; // Process one batch at a time

function stripGemmaChannelBlocks(text) {
  return String(text || '')
    .replace(/<\|channel\>thought[\s\S]*?(?:<\|channel\>|<channel\|>|<\|message\|>|$)/gi, '')
    .replace(/<\|start_header_id\>analysis<\|end_header_id\>[\s\S]*?(?:<\|start_header_id\>final<\|end_header_id\>|$)/gi, '')
    .replace(/<\|[^>]+?\|>/g, '')
    .trim();
}

async function probeLlamaServer() {
  const res = await fetch(`${LLAMA_SERVER_URL.replace(/\/+$/, '')}/v1/models`, { timeout: 5000 });
  if (!res.ok) throw new Error(`llama-server ${res.status}: ${await res.text()}`);
}

async function probeTriton() {
  const res = await fetch(`${TRITON_URL.replace(/\/+$/, '')}/v2/health/ready`, { timeout: 5000 });
  if (!res.ok) throw new Error(`Triton ${res.status}: ${await res.text()}`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 1: Produce Batches
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function produceQueue() {
  console.log(`\n📤 Producer: Batching packets for Triton\n`);

  let connection, channel;

  try {
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    await channel.assertExchange(EXCHANGE, 'fanout', { durable: true });

    // Fetch all unsummarized chunks
    const result = await pool.query(`
      SELECT id, relative_path, content, qdrant_id
      FROM codebase_chunk_index
      WHERE summary IS NULL OR summary = ''
      ORDER BY id
      ${limit > 0 ? `LIMIT ${limit}` : ''}
    `);

    const chunks = result.rows;
    console.log(`  Total unsummarized chunks: ${chunks.length}`);
    console.log(`  Batch size: ${batchSize}\n`);

    let enqueued = 0;
    let batchNum = 0;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);

      const message = {
        batch_id: batchNum,
        chunk_count: batch.length,
        chunks: batch.map(c => ({
          chunk_id: c.id,
          source_ref: c.relative_path,
          content: c.content.slice(0, 2000), // Truncate for speed
          qdrant_id: c.qdrant_id
        })),
        timestamp: Date.now()
      };

      channel.publish(
        EXCHANGE,
        '',
        Buffer.from(JSON.stringify(message)),
        { persistent: true, contentType: 'application/json' }
      );

      enqueued++;
      batchNum++;

      if (enqueued % 10 === 0) {
        console.log(`  ✓ Enqueued ${enqueued} batches (${i + batchSize}/${chunks.length} chunks)`);
      }
    }

    console.log(`\n  ✅ Enqueued ${enqueued} batches of ${batchSize} packets to ${EXCHANGE}`);
    console.log(`  📋 Start worker: node phase7-triton-batch-summaries.mjs --worker --batch-size=${batchSize}\n`);

  } catch (err) {
    console.error(`❌ Producer error:`, err.message);
    process.exit(1);
  } finally {
    if (channel) await channel.close();
    if (connection) await connection.close();
    await pool.end();
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 2: Batch Summarization via Triton
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function generateBatchSummaries(contents) {
  if (backend === 'llama-server' || backend === 'gemma4') {
    if (contents.length > MAX_GEMMA4_FALLBACK_BATCH && !allowLargeLlamaBatch) {
      throw new Error(
        `llama-server RotorQuant backend is bounded to ${MAX_GEMMA4_FALLBACK_BATCH} items per batch. ` +
        `Use --batch-size<=${MAX_GEMMA4_FALLBACK_BATCH}, or pass --allow-large-llama-batch intentionally.`
      );
    }
    return await fallbackGemma4Batch(contents);
  }

  if (backend !== 'triton') {
    throw new Error(`Unsupported Phase 7 summary backend: ${backend}`);
  }

  /**
   * Call Triton TensorRT-LLM model server for batch inference.
   * Triton handles batching, quantization, and GPU scheduling.
   *
   * Expected API: POST /v2/models/ensemble_summarizer/infer
   * Input: 512 texts (or configurable batch size)
   * Output: 512 summaries
   */

  try {
    const res = await fetch(`${TRITON_URL}/v2/models/ensemble_summarizer/infer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: [
          {
            name: 'text_input',
            shape: [contents.length],
            datatype: 'BYTES',
            data: contents
          }
        ],
        outputs: [{ name: 'text_output' }]
      }),
      timeout: 120000 // 2 min for large batch
    });

    if (!res.ok) {
      throw new Error(`Triton ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
        const summaries = (data.outputs?.[0]?.data || []).map(stripGemmaChannelBlocks);

    return summaries;

  } catch (err) {
    console.warn(`  ⚠️  Triton batch failed: ${err.message}`);

    if (!allowGemma4Fallback || contents.length > MAX_GEMMA4_FALLBACK_BATCH) {
      throw new Error(
        `Triton unavailable and Gemma4 fallback blocked for batch size ${contents.length}. ` +
        `Start Triton on ${TRITON_URL}, or rerun with --allow-gemma4-fallback and batch size <= ${MAX_GEMMA4_FALLBACK_BATCH}.`
      );
    }

    console.warn(`  Fallback: Using individual Gemma4 calls for smoke batch (${contents.length} items)`);

    // Fallback to sequential Gemma4 (slower but works without Triton)
    return await fallbackGemma4Batch(contents);
  }
}

async function fallbackGemma4Batch(contents) {
  const summaries = [];

  for (const content of contents) {
    try {
      const res = await fetch(`${LLAMA_SERVER_URL.replace(/\/+$/, '')}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: LLAMA_MODEL,
          messages: [
            { role: 'system', content: 'Summarize in 1-2 sentences.' },
            { role: 'user', content: content.slice(0, 2000) }
          ],
          temperature: 0.3,
          max_tokens: 150,
          stream: false
        }),
        timeout: 30000
      });

      if (res.ok) {
        const data = await res.json();
        summaries.push(stripGemmaChannelBlocks(data.choices?.[0]?.message?.content || ''));
      } else {
        summaries.push('');
      }
    } catch (err) {
      summaries.push('');
    }
  }

  return summaries;
}

async function updateBatchResults(chunks, summaries) {
  /**
   * Write summaries back to three stores:
   *   1. Postgres (canonical truth)
   *   2. Qdrant (payload mirror)
   *   3. Redis (cache)
   */

  await redis.connect();

  try {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const summary = summaries[i] || '';

      if (!summary) continue;

      // 1. Postgres update
      await pool.query(
        `UPDATE codebase_chunk_index SET summary = $1, updated_at = NOW() WHERE id = $2`,
        [summary, chunk.chunk_id]
      );

      // 2. Redis cache (TTL 24h)
      const cacheKey = `bitfrost:summary:${chunk.chunk_id}`;
      await redis.setex(cacheKey, 86400, summary);

      // 3. Qdrant payload update (optional, can skip for speed)
      if (chunk.qdrant_id) {
        try {
          await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/${chunk.qdrant_id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              points: [{ id: chunk.qdrant_id, payload: { summary } }]
            })
          });
        } catch (err) {
          // Skip Qdrant errors; Postgres write is canonical
        }
      }
    }

  } finally {
    await redis.quit();
  }
}

async function startWorker() {
  console.log(`\n🤖 Batch Worker ${workerId}: Starting (batch size=${batchSize})\n`);
  console.log(`  Backend: ${backend}${backend === 'llama-server' || backend === 'gemma4' ? ` (${LLAMA_SERVER_URL}, ${LLAMA_MODEL})` : ` (${TRITON_URL})`}`);
  if (once) console.log(`  Smoke mode: --once enabled; worker exits after one batch.\n`);

  let connection, channel;
  let processed = 0;
  let chunksProcessed = 0;

  try {
    if (backend === 'llama-server' || backend === 'gemma4') {
      await probeLlamaServer();
    } else if (backend === 'triton') {
      await probeTriton();
    }

    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    await channel.assertExchange(EXCHANGE, 'fanout', { durable: true });

    const queueName = `${QUEUE_PREFIX}.${workerId}`;
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

        const startTime = Date.now();
        process.stdout.write(`  [${new Date().toISOString().slice(11, 19)}] Batch ${batch_id}: ${chunks.length} chunks...`);

        // Extract content for summarization
        const contents = chunks.map(c => c.content);

        // Call Triton batch or fallback to Gemma4
        const summaries = await generateBatchSummaries(contents);

        // Write results to Postgres + Redis + Qdrant
        await updateBatchResults(chunks, summaries);

        const elapsed = Date.now() - startTime;
        console.log(` ✓ (${elapsed}ms)`);

        processed++;
        chunksProcessed += chunks.length;

        channel.ack(msg);

        if (once) {
          console.log(`\n  ✅ --once complete (${processed} batch, ${chunksProcessed} chunks)\n`);
          setImmediate(async () => {
            await channel.close().catch(() => {});
            await connection.close().catch(() => {});
            await pool.end().catch(() => {});
            process.exit(0);
          });
        }

      } catch (err) {
        console.error(`\n  ❌ Error: ${err.message}`);
        channel.nack(msg, false, !once); // Requeue unless this was a smoke probe
        if (once) {
          setImmediate(async () => {
            await channel.close().catch(() => {});
            await connection.close().catch(() => {});
            await pool.end().catch(() => {});
            process.exit(1);
          });
        }
      }

      if (processed % 10 === 0) {
        console.log(`  📊 Progress: ${processed} batches, ${chunksProcessed} chunks processed\n`);
      }
    }, { noAck: false });

  } catch (err) {
    console.error(`❌ Worker error:`, err.message);
    process.exit(1);
  }

  process.on('SIGINT', async () => {
    console.log(`\n\n  ✅ Worker ${workerId} stopped (${processed} batches, ${chunksProcessed} chunks)\n`);
    if (channel) await channel.close();
    if (connection) await connection.close();
    await pool.end();
    process.exit(0);
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 3: Monitor Progress
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function monitorProgress() {
  console.log(`\n📊 Batch Summary Progress Monitor\n`);

  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(summary) FILTER (WHERE summary IS NOT NULL AND summary != '') as summarized,
        COUNT(*) FILTER (WHERE summary IS NULL OR summary = '') as remaining
      FROM codebase_chunk_index
    `);

    const { total, summarized, remaining } = result.rows[0];
    const pct = Math.round((summarized / total) * 100);
    const rate = (summarized / total) * (40000 / 3600); // Packets per hour

    console.log(`  📈 Progress: ${summarized}/${total} summarized (${pct}%)`);
    console.log(`  ⏱️  Remaining: ${remaining} packets`);
    console.log(`  ⚡ Rate: ~${rate.toFixed(0)} packets/hour\n`);

    if (remaining > 0 && rate > 0) {
      const hoursLeft = remaining / rate;
      console.log(`  🕐 ETA: ${hoursLeft.toFixed(1)} hours\n`);
    }

  } catch (err) {
    console.error(`❌ Monitor error:`, err.message);
  } finally {
    await pool.end();
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

if (!mode) {
  console.error(`\n❌ Usage:`);
  console.error(`  node phase7-triton-batch-summaries.mjs --produce [--batch-size=512]`);
  console.error(`  node phase7-triton-batch-summaries.mjs --worker [--batch-size=512] [--id=1]`);
  console.error(`  node phase7-triton-batch-summaries.mjs --monitor\n`);
  process.exit(1);
}

if (mode === '--produce') {
  produceQueue().catch(err => {
    console.error(err);
    process.exit(1);
  });
} else if (mode === '--worker') {
  startWorker().catch(err => {
    console.error(err);
    process.exit(1);
  });
} else if (mode === '--monitor') {
  monitorProgress().catch(err => {
    console.error(err);
    process.exit(1);
  });
} else {
  console.error(`\n❌ Unknown mode: ${mode}\n`);
  process.exit(1);
}
