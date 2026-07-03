#!/usr/bin/env node
/**
 * Phase 7: Batch Enqueue Script
 * Continuously enqueues unsummarized chunks in large batches
 */

import amqp from 'amqplib';
import { Pool } from 'pg';

const BATCH_SIZE = 2000;
const INTERVAL_MS = 60000; // Re-enqueue every 60s

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@127.0.0.1:5672';

const pgPool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5434'),
  database: process.env.POSTGRES_DB || 'legal_ai_db',
  user: process.env.POSTGRES_USER || 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456',
});

let connection;
let channel;

async function initialize() {
  try {
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    await channel.assertQueue('phase7.summarization', { durable: true });
    console.log('✅ Connected to RabbitMQ');
  } catch (err) {
    console.error('❌ Failed to connect:', err.message);
    process.exit(1);
  }
}

async function enqueueBatch() {
  try {
    // Fetch unsummarized chunks
    const result = await pgPool.query(
      `SELECT id, content FROM codebase_chunk_index
       WHERE summary IS NULL OR summary = ''
       LIMIT $1`,
      [BATCH_SIZE]
    );

    if (result.rows.length === 0) {
      console.log(`[${new Date().toISOString()}] ✅ No unsummarized chunks remaining`);
      return 0;
    }

    // Enqueue all
    let enqueued = 0;
    for (const chunk of result.rows) {
      const msg = JSON.stringify({ id: chunk.id, content: chunk.content });
      channel.sendToQueue('phase7.summarization', Buffer.from(msg), { persistent: true });
      enqueued++;
    }

    console.log(
      `[${new Date().toISOString()}] ✅ Enqueued ${enqueued} chunks (${result.rows.length}/${BATCH_SIZE})`
    );

    return enqueued;
  } catch (err) {
    console.error(`❌ Enqueue error: ${err.message}`);
    return 0;
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Phase 7: Batch Enqueue Service                               ║');
  console.log(`║  Batch size: ${BATCH_SIZE} | Interval: ${INTERVAL_MS / 1000}s                           ║`);
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  await initialize();

  // Initial enqueue
  await enqueueBatch();

  // Keep enqueuing on interval
  setInterval(async () => {
    await enqueueBatch();
  }, INTERVAL_MS);
}

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  if (channel) await channel.close();
  if (connection) await connection.close();
  await pgPool.end();
  process.exit(0);
});

main();
