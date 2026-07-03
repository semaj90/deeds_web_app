#!/usr/bin/env node
/**
 * Phase 7: RabbitMQ Parallel Summary Queue
 *
 * Architecture:
 *   40,568 packets -> RabbitMQ durable work queue -> parallel workers
 *   Each worker: fetch chunk -> Gemma4 summary -> write Postgres
 *
 * Usage:
 *   # Start producer (enqueue all packets)
 *   node scripts/atlas/phase7-rabbitmq-summary-queue.mjs --produce --batch=1000
 *
 *   # Start workers (consume + summarize)
 *   node scripts/atlas/phase7-rabbitmq-summary-queue.mjs --worker --id=1
 *   node scripts/atlas/phase7-rabbitmq-summary-queue.mjs --worker --id=2
 *   (repeat for workers 3, 4)
 *
 *   # Monitor queue depth
 *   node scripts/atlas/phase7-rabbitmq-summary-queue.mjs --monitor
 */

import amqp from 'amqplib';
import pg from 'pg';
import fetch from 'node-fetch';
import process from 'process';
import { buildCanonicalPacketKey } from '../../../scripts/atlas/lib/packet-identity.mjs';
import {
  isUsableGemma4Summary,
  sanitizeGemma4Summary
} from '../../../scripts/atlas/lib/gemma4-summary-sanitizer.mjs';

const { Pool } = pg;

// Config
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@127.0.0.1:5672';
const GEMMA4_URL = process.env.GEMMA4_URL || 'http://127.0.0.1:8090';
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = 'codebase_chunks_768';

const QUEUE_NAME = process.env.PHASE7_SUMMARY_QUEUE || 'phase7.summarization';
const DLQ_NAME = `${QUEUE_NAME}.dlq`;
const MAX_RETRIES = parseInt(process.env.PHASE7_MAX_RETRIES || '3');
const PREFETCH = 1; // Fair dispatch: process one at a time
const HOT_BATCH_FEATURE_LIMIT = 1000;
const SUMMARY_PROMPT_TEMPLATE_VERSION = 'phase7-v2';
const GEMMA4_TIMEOUT_MS = parseInt(process.env.GEMMA4_TIMEOUT_MS || '120000');

// Postgres pool
const pool = new Pool({
  host: process.env.DATABASE_HOST || '127.0.0.1',
  port: parseInt(process.env.DATABASE_PORT || '5434'),
  user: process.env.DATABASE_USER || 'legal_admin',
  password: process.env.DATABASE_PASSWORD || process.env.DB_PASSWORD || '123456',
  database: process.env.DATABASE_NAME || 'legal_ai_db'
});

// Parse args
const mode = process.argv[2];
const workerId = process.argv.find(a => a.startsWith('--id='))?.split('=')[1] || '1';
const batchSize = parseInt(process.argv.find(a => a.startsWith('--batch='))?.split('=')[1] || '100');
const limit = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0');

async function sendToQueueAwaitDrain(channel, queueName, content, options) {
  const accepted = channel.sendToQueue(queueName, content, options);
  if (!accepted) {
    await new Promise(resolve => channel.once('drain', resolve));
  }
}

function normalizeKeyPart(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, '-')
    .replace(/[-/]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
}

function sourceRefPrefix(relativePath) {
  const cleaned = String(relativePath ?? '').replace(/\\/g, '/').trim();
  if (!cleaned) return 'unclassified';
  const parts = cleaned.split('/').filter(Boolean);
  if (parts.length <= 1) return parts[0] || 'unclassified';
  parts.pop();
  return parts.join('/') || 'unclassified';
}

function deriveReuseFeatureId(chunk) {
  const symbol = normalizeKeyPart(chunk.symbol);
  const kind = normalizeKeyPart(chunk.kind);
  const domain = normalizeKeyPart(chunk.domain);
  const language = normalizeKeyPart(chunk.language);
  const extension = normalizeKeyPart(chunk.extension);

  const primary = [domain, kind, symbol].filter(Boolean).join('.');
  if (primary) return primary;

  const fallback = [language, extension, sourceRefPrefix(chunk.relative_path)].filter(Boolean).join('.');
  return fallback || 'unclassified';
}

function derivePromptReuseBucket(chunk) {
  return [
    normalizeKeyPart(chunk.domain),
    normalizeKeyPart(chunk.language),
    normalizeKeyPart(chunk.kind),
    normalizeKeyPart(chunk.extension),
    sourceRefPrefix(chunk.relative_path)
  ].filter(Boolean).join('|') || 'unclassified';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PRODUCER: Enqueue all chunks
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function produceQueue() {
  console.log(`\n📤 Producer: Enqueuing packets to RabbitMQ\n`);

  let connection, channel;

  try {
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    await channel.assertQueue(QUEUE_NAME, { durable: true });
    await channel.assertQueue(DLQ_NAME, { durable: true });

    // Fetch all chunks from Postgres
    const result = await pool.query(`
      SELECT
        id,
        relative_path,
        line_start,
        line_end,
        content_hash,
        content,
        COALESCE(summary, '') as existing_summary,
        symbol,
        kind,
        domain,
        language,
        extension,
        som_cluster,
        gpu_cluster,
        page_rank_score,
        community_id
      FROM codebase_chunk_index
      WHERE summary IS NULL OR btrim(summary) = ''
      ORDER BY
        COALESCE(NULLIF(domain, ''), 'zzzz'),
        COALESCE(NULLIF(language, ''), 'zzzz'),
        COALESCE(NULLIF(kind, ''), 'zzzz'),
        COALESCE(NULLIF(extension, ''), 'zzzz'),
        COALESCE(NULLIF(symbol, ''), 'zzzz'),
        COALESCE(som_cluster, 999999),
        COALESCE(gpu_cluster, 999999),
        COALESCE(page_rank_score, 0) DESC,
        relative_path,
        id
    `);

    const chunks = result.rows;
    console.log(`  Total chunks to enqueue: ${chunks.length}`);

    let enqueued = 0;

    for (const chunk of chunks) {
      const packetKey = buildCanonicalPacketKey({
        sourceRef: chunk.relative_path,
        lineStart: chunk.line_start,
        lineEnd: chunk.line_end,
        contentHash: chunk.content_hash,
      });

      const message = {
        id: chunk.id,
        chunk_id: chunk.id,
        packet_key: packetKey,
        source_ref: chunk.relative_path,
        reuse_feature_id: deriveReuseFeatureId(chunk),
        prompt_reuse_bucket: derivePromptReuseBucket(chunk),
        prompt_template_version: SUMMARY_PROMPT_TEMPLATE_VERSION,
        prompt_reuse_hint: {
          template_version: SUMMARY_PROMPT_TEMPLATE_VERSION,
          feature_id: deriveReuseFeatureId(chunk),
          source_prefix: sourceRefPrefix(chunk.relative_path),
          language: chunk.language ?? null,
          kind: chunk.kind ?? null,
          som_cluster: chunk.som_cluster ?? null,
          gpu_cluster: chunk.gpu_cluster ?? null,
        },
        content: chunk.content,
        timestamp: Date.now()
      };

      await sendToQueueAwaitDrain(
        channel,
        QUEUE_NAME,
        Buffer.from(JSON.stringify(message)),
        { persistent: true, contentType: 'application/json' }
      );

      enqueued++;

      if (enqueued % batchSize === 0) {
        console.log(`  ✓ Enqueued ${enqueued}/${chunks.length}`);
      }

      if (limit > 0 && enqueued >= limit) {
        break;
      }
    }

    console.log(`\n  ✅ Enqueued ${enqueued} packets to ${QUEUE_NAME}`);
    console.log(`  📋 Start 4 workers: node phase7-rabbitmq-summary-queue.mjs --worker --id=N\n`);

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
// WORKER: Consume queue + summarize
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function sanitizeSummary(raw) {
  return sanitizeGemma4Summary(raw).summary;
}

async function generateSummary(content) {
  try {
    const res = await fetch(`${GEMMA4_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4-legal-iq4xs-direct.gguf',
        messages: [
          {
            role: 'system',
            content: 'Summarize this code/document in 1-2 sentences, focusing on what it does.'
          },
          { role: 'user', content: content.slice(0, 2000) }
        ],
        temperature: 0.3,
        max_tokens: 150,
        stream: false,
        cache_prompt: true,
        cache_reuse: 256
      }),
      signal: AbortSignal.timeout(GEMMA4_TIMEOUT_MS)
    });

    if (!res.ok) {
      throw new Error(`Gemma4 ${res.status}`);
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || '';
    const summary = sanitizeSummary(raw);
    return isUsableGemma4Summary(summary, { minLength: 30, minUniqueWords: 6 }) ? summary : '';
  } catch (err) {
    console.warn(`  ⚠️  Summary generation failed: ${err.message}`);
    return '';
  }
}


/**
 * Batch update multiple summaries in a single Postgres transaction
 * Expected gain: 20-30% throughput increase (reduced context switches)
 */
async function updatePgBatch(summaries) {
  if (!summaries || summaries.length === 0) return 0;

  try {
    // Build batch UPDATE using CASE expressions
    const ids = summaries.map((_, i) => summaries[i].id);
    const values = [];
    let placeholderIdx = 1;
    let cases = '';

    for (const summary of summaries) {
      values.push(summary.summary);
      cases += `WHEN ${summary.id} THEN $${placeholderIdx} `;
      placeholderIdx++;
    }

    const query = `
      UPDATE codebase_chunk_index
      SET summary = CASE id ${cases} END,
          updated_at = NOW()
      WHERE id = ANY($${placeholderIdx})
        AND (summary IS NULL OR btrim(summary) = '')
    `;

    values.push(ids);
    const result = await pool.query(query, values);
    return result.rowCount;

  } catch (err) {
    console.error(`  ❌ Batch update failed: ${err.message}`);
    throw err;
  }
}

function retryCountFor(msg) {
  return Number(msg.properties.headers?.['x-retry-count'] ?? 0);
}

function republishOrDlq(channel, msg, err) {
  const nextRetry = retryCountFor(msg) + 1;
  const targetQueue = nextRetry > MAX_RETRIES ? DLQ_NAME : QUEUE_NAME;
  channel.sendToQueue(targetQueue, msg.content, {
    persistent: true,
    contentType: msg.properties.contentType || 'application/json',
    headers: {
      ...(msg.properties.headers || {}),
      'x-retry-count': nextRetry,
      'x-last-error': String(err?.message || err).slice(0, 300)
    }
  });
  channel.ack(msg);
}

async function startWorker() {
  console.log(`\n🤖 Worker ${workerId}: Starting\n`);

  let connection, channel;
  let processed = 0;
  let failed = 0;
  let batchBuffer = [];
  const BATCH_SIZE = 100;
  const SKIP_L1_CACHE = process.env.PHASE7_SKIP_L1_CACHE === 'true';

  if (SKIP_L1_CACHE) {
    console.log(`  ⚡ L1 cache skipped (PHASE7_SKIP_L1_CACHE=true)\n`);
  }

  try {
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    const queue = await channel.assertQueue(QUEUE_NAME, { durable: true, exclusive: false });
    await channel.assertQueue(DLQ_NAME, { durable: true });

    // Fair dispatch (increase to allow pipelining)
    await channel.prefetch(PREFETCH);

    console.log(`  ✓ Listening on ${QUEUE_NAME} as worker ${workerId}`);
    console.log(`  Type Ctrl+C to stop\n`);

    // Consume with batching
    await channel.consume(queue.queue, async (msg) => {
      if (!msg) return;

      try {
        const payload = JSON.parse(msg.content.toString());
        const chunk_id = payload.id ?? payload.chunk_id;
        // eslint-disable-next-line no-unused-vars
        const { source_ref, content } = payload; // source_ref reserved for Phase 8 reranker

        process.stdout.write(`  [${new Date().toISOString().slice(11, 19)}] Summarizing ${chunk_id}...`);

        const summary = await generateSummary(content);

        if (summary) {
          // Add to batch buffer instead of immediate write
          batchBuffer.push({ id: chunk_id, summary });
          console.log(` ✓ (buffered)`);
          processed++;

          // Flush batch when full
          if (batchBuffer.length >= BATCH_SIZE) {
            const flushed = await updatePgBatch(batchBuffer);
            console.log(`  📦 Flushed batch: ${flushed} summaries written`);
            batchBuffer = [];
          }
        } else {
          console.log(` (skipped)`);
          failed++;
        }

        channel.ack(msg);

      } catch (err) {
        console.error(`\n  ❌ Error: ${err.message}`);
        failed++;
        republishOrDlq(channel, msg, err);
      }

      if ((processed + failed) % 100 === 0) {
        console.log(`  📊 Progress: ${processed} done, ${failed} failed, buffer: ${batchBuffer.length}\n`);
      }
    }, { noAck: false });

  } catch (err) {
    console.error(`❌ Worker error:`, err.message);
    process.exit(1);
  }

  process.on('SIGINT', async () => {
    // Flush any remaining batch before shutdown
    if (batchBuffer.length > 0) {
      try {
        const flushed = await updatePgBatch(batchBuffer);
        console.log(`  📦 Flushed final batch on shutdown: ${flushed} summaries`);
      } catch (err) {
        console.error(`  ❌ Final batch flush failed: ${err.message}`);
      }
    }

    console.log(`\n\n  ✅ Worker ${workerId} stopped (${processed} processed, ${failed} failed)\n`);
    if (channel) await channel.close();
    if (connection) await connection.close();
    await pool.end();
    process.exit(0);
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MONITOR: Queue depth
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function monitorQueue() {
  console.log(`\n📊 Queue Monitor\n`);

  let connection, channel;

  try {
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    const queue = await channel.assertQueue(QUEUE_NAME, { durable: true });
    const dlq = await channel.assertQueue(DLQ_NAME, { durable: true });
    console.log(`  Work queue ${QUEUE_NAME}: ${queue.messageCount} messages, ${queue.consumerCount} consumers`);
    console.log(`  DLQ ${DLQ_NAME}: ${dlq.messageCount} messages, ${dlq.consumerCount} consumers`);

    // Check Postgres progress
    const result = await pool.query(
      `SELECT COUNT(*) as total, COUNT(summary) as summarized FROM codebase_chunk_index WHERE summary IS NOT NULL AND summary != ''`
    );

    const { total, summarized } = result.rows[0];
    const pct = Math.round((summarized / total) * 100);
    console.log(`\n  📈 Postgres: ${summarized}/${total} summarized (${pct}%)\n`);

  } catch (err) {
    console.error(`❌ Monitor error:`, err.message);
  } finally {
    if (channel) await channel.close();
    if (connection) await connection.close();
    await pool.end();
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AUTO-REFILL: Monitor queue and refill when depth drops
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function autoRefillLoop() {
  console.log(`\n🔄 Auto-Refill Monitor (threshold: 500 messages)\n`);

  const REFILL_THRESHOLD = 500;
  const CHECK_INTERVAL_MS = 30000; // 30 seconds
  const REFILL_BATCH = 1000;

  let connection, channel;

  try {
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    await channel.assertQueue(QUEUE_NAME, { durable: true });

    setInterval(async () => {
      try {
        const queue = await channel.checkQueue(QUEUE_NAME);
        const messageCount = queue.messageCount;

        // Check Postgres for remaining unsummarized chunks
        const dbResult = await pool.query(
          `SELECT COUNT(*) as missing FROM codebase_chunk_index WHERE summary IS NULL OR btrim(summary) = ''`
        );
        const missing = parseInt(dbResult.rows[0].missing);

        if (messageCount < REFILL_THRESHOLD && missing > 0) {
          console.log(`\n  📢 Queue low (${messageCount} msgs, ${missing} chunks missing) — refilling...`);

          // Fetch unsummarized chunks
          const chunks = await pool.query(`
            SELECT
              id, relative_path, line_start, line_end, content_hash, content,
              symbol, kind, domain, language, extension,
              som_cluster, gpu_cluster, page_rank_score, community_id
            FROM codebase_chunk_index
            WHERE summary IS NULL OR btrim(summary) = ''
            ORDER BY
              COALESCE(NULLIF(domain, ''), 'zzzz'),
              COALESCE(NULLIF(language, ''), 'zzzz'),
              COALESCE(NULLIF(kind, ''), 'zzzz'),
              COALESCE(page_rank_score, 0) DESC,
              id
            LIMIT $1
          `, [REFILL_BATCH]);

          let enqueued = 0;
          for (const chunk of chunks.rows) {
            const packetKey = buildCanonicalPacketKey({
              sourceRef: chunk.relative_path,
              lineStart: chunk.line_start,
              lineEnd: chunk.line_end,
              contentHash: chunk.content_hash,
            });

            const message = {
              id: chunk.id,
              chunk_id: chunk.id,
              packet_key: packetKey,
              source_ref: chunk.relative_path,
              reuse_feature_id: deriveReuseFeatureId(chunk),
              prompt_reuse_bucket: derivePromptReuseBucket(chunk),
              content: chunk.content,
              timestamp: Date.now()
            };

            await sendToQueueAwaitDrain(
              channel,
              QUEUE_NAME,
              Buffer.from(JSON.stringify(message)),
              { persistent: true, contentType: 'application/json' }
            );
            enqueued++;
          }

          console.log(`  ✅ Enqueued ${enqueued} chunks, queue refilled\n`);
        }
      } catch (err) {
        console.error(`  ⚠️  Refill check failed: ${err.message}`);
      }
    }, CHECK_INTERVAL_MS);

  } catch (err) {
    console.error(`❌ Auto-refill error:`, err.message);
    process.exit(1);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

if (!mode) {
  console.error(`\n❌ Usage:`);
  console.error(`  node phase7-rabbitmq-summary-queue.mjs --produce [--batch=N]`);
  console.error(`  node phase7-rabbitmq-summary-queue.mjs --worker [--id=N]`);
  console.error(`  node phase7-rabbitmq-summary-queue.mjs --monitor`);
  console.error(`  node phase7-rabbitmq-summary-queue.mjs --auto-refill\n`);
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
  monitorQueue().catch(err => {
    console.error(err);
    process.exit(1);
  });
} else if (mode === '--auto-refill') {
  autoRefillLoop().catch(err => {
    console.error(err);
    process.exit(1);
  });
} else {
  console.error(`\n❌ Unknown mode: ${mode}\n`);
  process.exit(1);
}
