#!/usr/bin/env node
/**
 * Qdrant Collection Upsert Worker
 *
 * Upsets canonical packet embeddings to Qdrant collections.
 * Runs in parallel with embedding worker; subscribes to RabbitMQ
 * for new embeddings and syncs them to Qdrant.
 *
 * Usage:
 *   node scripts/atlas/qdrant-upsert-worker.mjs --worker
 *   node scripts/atlas/qdrant-upsert-worker.mjs --stats
 */

import { createRequire } from 'module';
import { argv } from 'process';
import pg from 'pg';

const require = createRequire(import.meta.url);
const amqp = require('amqplib');
const { QdrantClient } = require('@qdrant/js-client-rest');

// ── Configuration ────────────────────────────────────────────────────────────

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const DB_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QUEUE = 'phase1.qdrant-upserts';
const COLLECTION = 'codebase_chunks_768';
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '1');

const MODE = argv.includes('--worker') ? 'worker' : argv.includes('--stats') ? 'stats' : 'worker';

const db = new pg.Pool({ connectionString: DB_URL, max: 10 });
const qdrant = new QdrantClient({ url: QDRANT_URL });

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

async function upsertQdrantPoint(pointId, embedding, packetKey, sourceRef, filePath, featureId, featureLabel, summary, verbose = false) {
  try {
    if (verbose) log(`  → Upserting Qdrant point ${pointId} for ${featureLabel}`);

    const point = {
      id: pointId,
      vector: embedding,
      payload: {
        packet_key: packetKey,
        source_ref: sourceRef,
        file_path: filePath,
        feature_id: featureId,
        feature_label: featureLabel,
        summary: summary,
        embedded_at: new Date().toISOString()
      }
    };

    await qdrant.upsert(COLLECTION, {
      points: [point]
    });

    if (verbose) log(`  ✓ Qdrant point ${pointId} upserted`);
    return true;
  } catch (e) {
    log(`  ❌ Qdrant upsert error: ${e.message}`);
    return false;
  }
}

// ── Worker Mode ──────────────────────────────────────────────────────────────

async function startWorker() {
  log(`🚀 Starting Qdrant upsert worker (concurrency: ${CONCURRENCY})`);

  let conn, channel;
  try {
    conn = await amqp.connect(RABBITMQ_URL);
    channel = await conn.createChannel();

    // Assert queue
    const qInfo = await channel.assertQueue(QUEUE, { durable: true });
    channel.prefetch(CONCURRENCY);

    let processed = 0;
    const startTime = Date.now();

    log(`  Waiting for upsert jobs on queue: ${QUEUE}`);
    log(`  Messages pending: ${qInfo.messageCount}\n`);

    channel.consume(QUEUE, async (msg) => {
      if (!msg) return;

      try {
        const job = JSON.parse(msg.content.toString());
        const { packet_id, packet_key, embedding, qdrant_point_id } = job;

        // Fetch full packet context from DB
        const dbRes = await db.query(
          `SELECT source_ref, file_path, feature_id, feature_label, summary FROM atlas_packets WHERE packet_id = $1`,
          [packet_id]
        );

        if (dbRes.rows.length === 0) {
          log(`  ⚠️  Packet ${packet_id} not found in DB, skipping`);
          channel.nack(msg, false, false);
          return;
        }

        const packet = dbRes.rows[0];
        const isVerbose = processed < 3;

        // Upsert to Qdrant
        const success = await upsertQdrantPoint(
          qdrant_point_id,
          embedding,
          packet_key,
          packet.source_ref,
          packet.file_path,
          packet.feature_id,
          packet.feature_label,
          packet.summary,
          isVerbose
        );

        if (success) {
          processed++;
          if (processed % 50 === 0) {
            const elapsed = (Date.now() - startTime) / 1000;
            const throughput = processed / elapsed;
            log(`  ${processed} upserted | ${throughput.toFixed(2)} points/sec`);
          }
          channel.ack(msg);
        } else {
          // Requeue on failure
          channel.nack(msg, false, true);
        }
      } catch (e) {
        log(`  ❌ Job error: ${e.message}`);
        channel.nack(msg, false, true); // Requeue on error
      }
    });

    // Keep worker alive
    process.on('SIGINT', async () => {
      log(`\n✅ Qdrant worker shutdown`);
      log(`  Upserted: ${processed} points to ${COLLECTION}`);
      await channel.close();
      await conn.close();
      await db.end();
      process.exit(0);
    });

  } catch (e) {
    log(`❌ Worker error: ${e.message}`);
    try { await channel?.close(); } catch { /* */ }
    try { await conn?.close(); } catch { /* */ }
    try { await db.end(); } catch { /* */ }
    process.exit(1);
  }
}

// ── Stats Mode ───────────────────────────────────────────────────────────────

async function showStats() {
  log(`📊 Qdrant Upsert Queue Status`);

  try {
    // Check queue depth
    let conn, channel;
    try {
      conn = await amqp.connect(RABBITMQ_URL);
      channel = await conn.createChannel();
      const queueInfo = await channel.checkQueue(QUEUE).catch(() => ({ messageCount: 0 }));
      log(`  Queue '${QUEUE}': ${queueInfo.messageCount} pending upserts`);
      await channel.close();
      await conn.close();
    } catch (e) {
      log(`  Queue unavailable: ${e.message}`);
    }

    // Check Qdrant collection
    try {
      const collectionInfo = await qdrant.getCollection(COLLECTION);
      log(`  Qdrant collection '${COLLECTION}': ${collectionInfo.points_count} points`);
    } catch (e) {
      log(`  Qdrant unavailable: ${e.message}`);
    }

  } catch (e) {
    log(`❌ Stats error: ${e.message}`);
    process.exit(1);
  } finally {
    try { await db.end(); } catch { /* */ }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  switch (MODE) {
    case 'worker':
      await startWorker();
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
