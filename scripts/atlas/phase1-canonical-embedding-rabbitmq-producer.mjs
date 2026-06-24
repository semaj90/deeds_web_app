#!/usr/bin/env node
/**
 * Phase 1 Canonical Embedding RabbitMQ Producer
 *
 * Enqueues embedding jobs for atlas_packets (canonical layer).
 * Batches 10 packets per job to maximize GPU throughput with llama-server --parallel 4.
 *
 * Flow:
 *   Postgres: SELECT id, packet_key, summary FROM atlas_packets WHERE embedding IS NULL
 *   → Batch into groups of 10 packets
 *   → Enqueue { batch_id, packets: [{ id, packet_key, summary }] }
 *   → RabbitMQ 'codebase.canonical.embed' queue (persistent, durable)
 *   → Worker consumes, calls Ollama :11434 /api/embeddings for 768-dim vectors
 *   → Worker UPDATE atlas_packets SET embedding = $1::vector WHERE id = $2
 *   → Ack message (auto-retry if worker crashes)
 *
 * Performance:
 *   Enqueue: 7,232 packets @ 10/batch = 724 batches in ~2 seconds
 *   Workers (4x): 7,232 / (0.5s/batch × 4) = ~30 minutes
 *   With Bifrost L2 cache hits (30%): ~25 minutes
 *
 * Usage:
 *   node scripts/atlas/phase1-canonical-embedding-rabbitmq-producer.mjs --enqueue [--limit=1000]
 *   node scripts/atlas/phase1-canonical-embedding-rabbitmq-producer.mjs --stats
 */

import pg from 'pg';
import { createRequire } from 'module';
import { argv } from 'process';

const require = createRequire(import.meta.url);
const amqp = require('amqplib');

// ── Configuration ────────────────────────────────────────────────────────────

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const DB_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QUEUE = 'codebase.canonical.embed';
const BATCH_SIZE = 10; // Packets per job (tuned for llama-server --parallel 4 --slots 4)

const MODE = argv.includes('--enqueue') ? 'enqueue' : argv.includes('--stats') ? 'stats' : 'enqueue';
const LIMIT = parseInt(process.env.PACKET_LIMIT || '0');

const db = new pg.Pool({ connectionString: DB_URL, max: 5 });

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

// ── Enqueue Mode ─────────────────────────────────────────────────────────────

async function enqueueJobs() {
  log(`🚀 Enqueuing Phase 1 canonical embedding jobs`);

  let conn, channel;
  try {
    conn = await amqp.connect(RABBITMQ_URL);
    channel = await conn.createChannel();

    // Use checkQueue to verify it exists
    const qInfo = await channel.checkQueue(QUEUE);
    log(`  Queue '${QUEUE}' exists: ${qInfo.messageCount} current messages, ${qInfo.consumerCount} consumers\n`);

    // Fetch packets needing embeddings
    const result = await db.query(`
      SELECT id, packet_key, summary
      FROM atlas_packets
      WHERE embedding IS NULL
      ORDER BY created_at DESC
      LIMIT $1
    `, [LIMIT || 7232]);

    const packets = result.rows;
    log(`Found ${packets.length} packets needing embeddings\n`);

    let enqueued = 0;
    const batchId = `canonical-embed-${Date.now()}`;

    // Batch into groups of BATCH_SIZE (10 packets per job)
    for (let i = 0; i < packets.length; i += BATCH_SIZE) {
      const batchPackets = packets.slice(i, i + BATCH_SIZE);
      const job = {
        batch_id: batchId,
        job_index: Math.floor(i / BATCH_SIZE),
        total_jobs: Math.ceil(packets.length / BATCH_SIZE),
        packets: batchPackets.map(p => ({
          id: p.id,
          packet_key: p.packet_key,
          summary: p.summary
        })),
        timestamp: new Date().toISOString()
      };

      const msgBuffer = Buffer.from(JSON.stringify(job));
      channel.sendToQueue(QUEUE, msgBuffer, { persistent: true });
      enqueued++;

      if (enqueued % 100 === 0) {
        log(`  Enqueued ${enqueued} batches (${enqueued * BATCH_SIZE}/${packets.length} packets)`);
      }
    }

    log(`\n✅ Complete`);
    log(`  Total batches: ${enqueued}`);
    log(`  Total packets: ${packets.length}`);
    log(`  Batch size: ${BATCH_SIZE} packets/job`);
    log(`  Batch ID: ${batchId}`);
    log(`  Queue: ${QUEUE} (persistent, durable)`);
    log(`  ETA (4 workers @ 0.5s/batch): ${((enqueued / 4) * 0.5 / 60).toFixed(1)} minutes\n`);
    log(`Start workers:`);
    log(`  node scripts/atlas/phase1-canonical-embedding-rabbitmq-worker.mjs --concurrency=4\n`);

    await channel.close();
    await conn.close();
  } catch (e) {
    log(`❌ Enqueue error: ${e.message}`);
    if (channel) await channel.close().catch(() => {});
    if (conn) await conn.close().catch(() => {});
    process.exit(1);
  } finally {
    try {
      await db.end();
    } catch {
      // Already closed
    }
  }
}

// ── Stats Mode ───────────────────────────────────────────────────────────────

async function showStats() {
  log(`📊 Phase 1 Canonical Embedding Status`);

  try {
    const result = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN embedding IS NULL THEN 1 END) as missing,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as present
      FROM atlas_packets
    `);

    const { total, missing, present } = result.rows[0];
    log(`  Total packets: ${total}`);
    log(`  With embeddings: ${present}/${total} (${(present/total*100).toFixed(1)}%)`);
    log(`  Missing embeddings: ${missing}/${total} (${(missing/total*100).toFixed(1)}%)`);
    log(`  Projected jobs: ${Math.ceil(missing / BATCH_SIZE)} (batch size: ${BATCH_SIZE})\n`);

    // Check queue depth
    let conn, channel;
    try {
      conn = await amqp.connect(RABBITMQ_URL);
      channel = await conn.createChannel();
      const queueInfo = await channel.checkQueue(QUEUE);
      log(`  Queue '${QUEUE}': ${queueInfo.messageCount} pending jobs, ${queueInfo.consumerCount} active workers\n`);
      await channel.close();
      await conn.close();
    } catch (e) {
      log(`  Queue unavailable: ${e.message}\n`);
    }

  } catch (e) {
    log(`❌ Stats error: ${e.message}`);
    process.exit(1);
  } finally {
    try {
      await db.end();
    } catch {
      // Already closed
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  switch (MODE) {
    case 'enqueue':
      await enqueueJobs();
      break;
    case 'stats':
      await showStats();
      break;
  }
}

main().catch(e => {
  console.error(`\n❌ Fatal: ${e.message}`);
  process.exit(1);
});
