#!/usr/bin/env node
/**
 * Phase 1 RabbitMQ Batch Summarizer Producer
 *
 * Enqueues summary-generation jobs for codebase_chunk_index (40,754 chunks).
 * Workers consume from 'codebase.index' queue and call Gemma4 for summaries.
 *
 * Flow:
 *   Postgres: SELECT id, relative_path, content FROM codebase_chunk_index WHERE summary IS NULL
 *   → Enqueue job { id, relative_path, content, batch_id, timestamp }
 *   → RabbitMQ 'codebase.index' queue (persistent, durable)
 *   → Worker consumes, calls Gemma4 /v1/chat/completions
 *   → Worker UPDATE codebase_chunk_index SET summary = $1 WHERE id = $2
 *   → Ack message (auto-retry if worker crashes)
 *
 * Performance:
 *   Enqueue: 40,754 chunks @ 500/batch = 82 batches in ~15 seconds
 *   Workers (4x): 40,754 / (0.67s/chunk × 4) = ~2.5 hours
 *   With Bifrost L2 cache hits (70%): ~45 minutes
 *
 * Usage:
 *   node scripts/atlas/phase1-rabbitmq-batch-summarizer.mjs --enqueue [--batch=500] [--limit=1000]
 *   node scripts/atlas/phase1-rabbitmq-batch-summarizer.mjs --worker [--concurrency=1]
 *   node scripts/atlas/phase1-rabbitmq-batch-summarizer.mjs --stats
 */

import pg from 'pg';
import { createRequire } from 'module';
import { argv } from 'process';

const require = createRequire(import.meta.url);
const amqp = require('amqplib');

// ── Configuration ────────────────────────────────────────────────────────────

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const DB_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const GEMMA4_URL = process.env.GEMMA4_URL || 'http://127.0.0.1:8090';
const QUEUE = 'codebase.index';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '500');
const LIMIT = parseInt(process.env.CHUNK_LIMIT || '0');
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '1');

const MODE = argv.includes('--enqueue') ? 'enqueue' : argv.includes('--worker') ? 'worker' : argv.includes('--stats') ? 'stats' : 'enqueue';

const db = new pg.Pool({ connectionString: DB_URL, max: 10 });

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

async function callGemma4(content) {
  try {
    const res = await fetch(`${GEMMA4_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4-legal-iq4xs-direct.gguf',
        messages: [
          { role: 'system', content: 'Summarize this code or document in 1-2 sentences.' },
          { role: 'user', content }
        ],
        temperature: 0.3,
        max_tokens: 150,
        stream: false
      }),
      signal: AbortSignal.timeout(60_000)
    });

    if (!res.ok) {
      log(`  ⚠️  Gemma4 error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const summary = data.choices?.[0]?.message?.content?.trim();

    if (!summary) {
      log(`  ⚠️  Gemma4 returned empty summary`);
      return null;
    }

    // Strip control tokens
    return summary
      .replace(/\[INST\].*?\[\/INST\]/g, '')
      .replace(/<<SYS>>.*?<\/SYS>>/g, '')
      .trim();
  } catch (e) {
    log(`  ⚠️  Gemma4 fetch error: ${e.message}`);
    return null;
  }
}

// ── Enqueue Mode ─────────────────────────────────────────────────────────────

async function enqueueJobs() {
  log(`🚀 Enqueuing Phase 1 summary jobs`);

  let conn, channel;
  try {
    conn = await amqp.connect(RABBITMQ_URL);
    channel = await conn.createChannel();

    await channel.assertQueue(QUEUE, { durable: true });

    // Fetch chunks needing summaries
    const result = await db.query(`
      SELECT id, relative_path, content
      FROM codebase_chunk_index
      WHERE summary IS NULL
      ORDER BY id
      LIMIT $1
    `, [LIMIT || 40754]);

    const chunks = result.rows;
    log(`  Found ${chunks.length} chunks needing summaries\n`);

    let enqueued = 0;
    const batchId = `batch-${Date.now()}`;

    for (const chunk of chunks) {
      const job = {
        id: chunk.id,
        relative_path: chunk.relative_path,
        content: chunk.content,
        batch_id: batchId,
        timestamp: new Date().toISOString()
      };

      const msgBuffer = Buffer.from(JSON.stringify(job));
      channel.sendToQueue(QUEUE, msgBuffer, { persistent: true });
      enqueued++;

      if (enqueued % 1000 === 0) {
        log(`  Enqueued ${enqueued}/${chunks.length} jobs`);
      }
    }

    log(`\n✅ Complete`);
    log(`  Total enqueued: ${enqueued}`);
    log(`  Batch ID: ${batchId}`);
    log(`  Queue: ${QUEUE} (persistent, durable)`);
    log(`  Start workers: node scripts/atlas/phase1-rabbitmq-batch-summarizer.mjs --worker --concurrency=4\n`);

    await channel.close();
    await conn.close();
  } catch (e) {
    log(`❌ Enqueue error: ${e.message}`);
    if (channel) await channel.close();
    if (conn) await conn.close();
    process.exit(1);
  } finally {
    await db.end();
  }
}

// ── Worker Mode ──────────────────────────────────────────────────────────────

async function startWorker() {
  log(`👷 Starting Phase 1 worker (concurrency: ${CONCURRENCY})`);

  let conn, channel;
  try {
    conn = await amqp.connect(RABBITMQ_URL);
    channel = await conn.createChannel();

    await channel.assertQueue(QUEUE, { durable: true });
    channel.prefetch(CONCURRENCY); // Fair dispatch

    let processed = 0;
    const startTime = Date.now();

    log(`  Waiting for jobs on queue: ${QUEUE}\n`);

    channel.consume(QUEUE, async (msg) => {
      if (!msg) return;

      try {
        const job = JSON.parse(msg.content.toString());
        const { id, relative_path, content } = job;

        // Call Gemma4
        const summary = await callGemma4(content);

        if (summary) {
          // Write to database
          await db.query(
            `UPDATE codebase_chunk_index SET summary = $1, updated_at = now() WHERE id = $2`,
            [summary, id]
          );

          processed++;
          if (processed % 50 === 0) {
            const elapsed = (Date.now() - startTime) / 1000;
            const throughput = processed / elapsed;
            log(`  ${processed} processed | ${throughput.toFixed(2)} chunks/sec | ETA: ${((40754 - processed) / throughput / 60).toFixed(1)}m`);
          }

          channel.ack(msg);
        } else {
          // Skip on failure, nack without requeue
          channel.nack(msg, false, false);
        }
      } catch (e) {
        log(`  ❌ Job error: ${e.message}`);
        channel.nack(msg, false, true); // Requeue on error
      }
    });

    // Keep worker alive
    process.on('SIGINT', async () => {
      log(`\n✅ Worker shutdown`);
      log(`  Processed: ${processed} chunks`);
      await channel.close();
      await conn.close();
      process.exit(0);
    });

  } catch (e) {
    log(`❌ Worker error: ${e.message}`);
    if (channel) await channel.close();
    if (conn) await conn.close();
    process.exit(1);
  }
}

// ── Stats Mode ───────────────────────────────────────────────────────────────

async function showStats() {
  log(`📊 Phase 1 Summary Status`);

  try {
    const result = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN summary IS NULL THEN 1 END) as missing,
        COUNT(CASE WHEN summary IS NOT NULL THEN 1 END) as present
      FROM codebase_chunk_index
    `);

    const { total, missing, present } = result.rows[0];
    log(`  Total chunks: ${total}`);
    log(`  With summaries: ${present}/${total} (${(present/total*100).toFixed(1)}%)`);
    log(`  Missing summaries: ${missing}/${total} (${(missing/total*100).toFixed(1)}%)\n`);

    // Check queue depth
    let conn, channel;
    try {
      conn = await amqp.connect(RABBITMQ_URL);
      channel = await conn.createChannel();
      const queueInfo = await channel.checkQueue(QUEUE);
      log(`  Queue '${QUEUE}': ${queueInfo.messageCount} pending jobs`);
      await channel.close();
      await conn.close();
    } catch (e) {
      log(`  Queue unavailable: ${e.message}`);
    }

  } catch (e) {
    log(`❌ Stats error: ${e.message}`);
    process.exit(1);
  } finally {
    await db.end();
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  switch (MODE) {
    case 'enqueue':
      await enqueueJobs();
      break;
    case 'worker':
      await startWorker();
      break;
    case 'stats':
      await showStats();
      await db.end();
      break;
  }
}

main().catch(e => {
  console.error(`\n❌ Fatal: ${e.message}`);
  process.exit(1);
});
