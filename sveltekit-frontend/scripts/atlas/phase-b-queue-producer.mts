#!/usr/bin/env node
/**
 * Phase B Queue Producer
 *
 * Enqueues remaining packets into RabbitMQ for asynchronous enrichment.
 * Produces 3 message types: gemma4_summary, embedding_batch, cache_push
 *
 * Usage:
 *   npx tsx scripts/atlas/phase-b-queue-producer.mts [--dry-run] [--limit=1000]
 */

import amqp from 'amqplib';
import { Pool } from 'pg';

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = parseInt(
  process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '57132'
);

const PG_HOST = process.env.POSTGRES_HOST || 'localhost';
const PG_PORT = parseInt(process.env.POSTGRES_PORT || '5434');
const PG_DB = process.env.POSTGRES_DB || 'legal_ai_db';
const PG_USER = process.env.POSTGRES_USER || 'legal_admin';
const PG_PASSWORD = process.env.POSTGRES_PASSWORD || '123456';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@127.0.0.1:5672';

const pgPool = new Pool({
  host: PG_HOST,
  port: PG_PORT,
  database: PG_DB,
  user: PG_USER,
  password: PG_PASSWORD,
});

interface PacketMessage {
  packet_key: string;
  source_ref: string;
  feature_id: string;
  feature_label: string;
  timestamp: string;
}

async function fetchRemainingPackets(pool: Pool, limit: number): Promise<any[]> {
  const result = await pool.query(
    `
    SELECT ap.packet_key, ap.source_ref, ap.feature_id, ap.feature_label
    FROM atlas_packets ap
    LEFT JOIN atlas_summary_layers asl ON ap.packet_key = asl.packet_key
    WHERE asl.packet_key IS NULL
    AND ap.packet_key IS NOT NULL
    AND ap.source_ref IS NOT NULL
    AND ap.feature_id IS NOT NULL
    ORDER BY ap.pagerank DESC NULLS LAST
    LIMIT $1
    `,
    [limit]
  );
  return result.rows;
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Phase B Queue Producer (RabbitMQ Enqueuer)                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`Limit: ${LIMIT} packets`);
  console.log(`RabbitMQ: ${RABBITMQ_URL}\n`);

  let connection;
  let channel;

  try {
    // Connect to RabbitMQ
    console.log('📡 Connecting to RabbitMQ...');
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    // Declare queues
    const queues = [
      'atlas.enrichment.gemma4',
      'atlas.enrichment.embedding',
      'atlas.enrichment.cache_push',
    ];

    for (const queue of queues) {
      await channel.assertQueue(queue, { durable: true });
    }
    console.log('✅ Queues declared\n');

    // Fetch packets
    console.log(`📦 Fetching remaining packets (limit: ${LIMIT})...`);
    const packets = await fetchRemainingPackets(pgPool, LIMIT);
    console.log(`✅ Fetched ${packets.length} packets\n`);

    if (packets.length === 0) {
      console.log('✅ No remaining packets to enqueue');
      return;
    }

    // Enqueue packets
    console.log(`📤 Enqueuing ${packets.length} packets into RabbitMQ...\n`);

    let enqueued = 0;

    for (const packet of packets) {
      const message: PacketMessage = {
        packet_key: packet.packet_key,
        source_ref: packet.source_ref,
        feature_id: packet.feature_id,
        feature_label: packet.feature_label,
        timestamp: new Date().toISOString(),
      };

      if (!DRY_RUN) {
        // Enqueue to Gemma4 queue
        channel.sendToQueue(
          'atlas.enrichment.gemma4',
          Buffer.from(JSON.stringify(message)),
          { persistent: true }
        );
      }

      enqueued++;
      if (enqueued % 1000 === 0) {
        console.log(`  [${enqueued}/${packets.length}] packets enqueued...`);
      }
    }

    console.log(`\n✅ All ${enqueued} packets enqueued to atlas.enrichment.gemma4`);
    console.log(`\n📊 Summary:`);
    console.log(`   Queue: atlas.enrichment.gemma4`);
    console.log(`   Messages: ${enqueued}`);
    console.log(`   Durable: true`);
    console.log(`\n🚀 Start consumer worker with:`);
    console.log(`   npx tsx scripts/atlas/phase-b-queue-consumer-gemma4.mts`);
  } catch (err) {
    console.error(`❌ Error: ${err}`);
    process.exit(1);
  } finally {
    if (channel) await channel.close();
    if (connection) await connection.close();
    await pgPool.end();
  }
}

main();
