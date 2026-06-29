#!/usr/bin/env node
/**
 * Phase B Summary Queue Bridge
 *
 * Bridges Gemma4 output (analysis_pass_results summaries) to EmbeddingGemma input queue.
 * Periodically polls atlas_summary_layers for new summaries without embeddings,
 * enqueues them to atlas.enrichment.embedding for the embedding consumer.
 *
 * Usage:
 *   npx tsx scripts/atlas/phase-b-summary-queue-bridge.mts [--interval=30] [--batch=100]
 */

import amqp from 'amqplib';
import { Pool } from 'pg';

const INTERVAL = parseInt(
  process.argv.find(arg => arg.startsWith('--interval='))?.split('=')[1] || '30'
) * 1000; // seconds → ms

const BATCH = parseInt(
  process.argv.find(arg => arg.startsWith('--batch='))?.split('=')[1] || '100'
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

interface SummaryRow {
  packet_key: string;
  source_ref: string;
  feature_id: string;
  feature_label: string;
  summary: string;
}

async function fetchSummariesWithoutEmbeddings(limit: number): Promise<SummaryRow[]> {
  const result = await pgPool.query(
    `
    SELECT DISTINCT ON (asl.packet_key)
      asl.packet_key,
      ap.source_ref,
      ap.feature_id,
      ap.feature_label,
      asl.summary
    FROM atlas_summary_layers asl
    JOIN atlas_packets ap ON ap.packet_key = asl.packet_key
    WHERE asl.summary IS NOT NULL
    AND asl.embedding IS NULL
    ORDER BY asl.packet_key, asl.created_at DESC
    LIMIT $1
    `,
    [limit]
  );
  return result.rows;
}

async function enqueueSummaries(
  channel: any,
  summaries: SummaryRow[]
): Promise<number> {
  let enqueued = 0;

  for (const summary of summaries) {
    const message = {
      packet_key: summary.packet_key,
      source_ref: summary.source_ref,
      feature_id: summary.feature_id,
      feature_label: summary.feature_label,
      summary: summary.summary,
      timestamp: new Date().toISOString(),
    };

    try {
      channel.sendToQueue(
        'atlas.enrichment.embedding',
        Buffer.from(JSON.stringify(message)),
        { persistent: true }
      );
      enqueued++;
    } catch (err) {
      console.error(`  ✗ Failed to enqueue ${summary.packet_key}: ${err}`);
    }
  }

  return enqueued;
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Phase B Summary Queue Bridge (Gemma4 → Embedding)            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`Polling interval: ${INTERVAL / 1000}s`);
  console.log(`Batch size: ${BATCH} summaries`);
  console.log(`RabbitMQ: ${RABBITMQ_URL}\n`);

  let connection;
  let channel;

  try {
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    await channel.assertQueue('atlas.enrichment.embedding', { durable: true });

    console.log('✅ Connected to RabbitMQ\n');
    console.log('🚀 Bridging summaries to embedding queue...\n');

    let bridged = 0;

    const bridge = async () => {
      try {
        const summaries = await fetchSummariesWithoutEmbeddings(BATCH);

        if (summaries.length > 0) {
          const enqueued = await enqueueSummaries(channel, summaries);
          bridged += enqueued;
          console.log(
            `[${new Date().toISOString()}] Enqueued ${enqueued}/${summaries.length} summaries (total: ${bridged})`
          );
        }
      } catch (err) {
        console.error(`  ✗ Error: ${err}`);
      }
    };

    // Initial run
    await bridge();

    // Poll periodically
    const interval = setInterval(bridge, INTERVAL);

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n\n🛑 Shutting down...');
      clearInterval(interval);
      if (channel) await channel.close();
      if (connection) await connection.close();
      await pgPool.end();
      console.log('✅ Closed');
      process.exit(0);
    });
  } catch (err) {
    console.error(`❌ Error: ${err}`);
    process.exit(1);
  }
}

main();
