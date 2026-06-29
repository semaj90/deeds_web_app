#!/usr/bin/env node
/**
 * Phase B Queue Consumer — EmbeddingGemma Worker
 *
 * Consumes summaries from RabbitMQ atlas.enrichment.embedding queue
 * Calls EmbeddingGemma via Ollama, logs analysis passes, updates atlas_summary_layers
 *
 * Usage:
 *   npx tsx scripts/atlas/phase-b-queue-consumer-embedding.mts [--dry-run]
 */

import amqp, { Channel, Connection, Message } from 'amqplib';
import { Pool } from 'pg';

const DRY_RUN = process.argv.includes('--dry-run');

const PG_HOST = process.env.POSTGRES_HOST || 'localhost';
const PG_PORT = parseInt(process.env.POSTGRES_PORT || '5434');
const PG_DB = process.env.POSTGRES_DB || 'legal_ai_db';
const PG_USER = process.env.POSTGRES_USER || 'legal_admin';
const PG_PASSWORD = process.env.POSTGRES_PASSWORD || '123456';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@127.0.0.1:5672';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const EMBEDDING_MODEL = 'embeddinggemma:latest';
const EMBEDDING_DIM = 384;

const pgPool = new Pool({
  host: PG_HOST,
  port: PG_PORT,
  database: PG_DB,
  user: PG_USER,
  password: PG_PASSWORD,
});

interface SummaryMessage {
  packet_key: string;
  source_ref: string;
  feature_id: string;
  feature_label: string;
  summary: string;
  timestamp: string;
}

async function callEmbeddingGemma(summary: string): Promise<number[] | null> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: summary,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.error(`  ⚠️  Ollama returned ${response.status}`);
      return null;
    }

    const data = (await response.json()) as any;
    const embedding = data.embeddings?.[0];

    if (!embedding || embedding.length !== EMBEDDING_DIM) {
      console.error(`  ⚠️  Invalid embedding dimension: ${embedding?.length}`);
      return null;
    }

    return embedding;
  } catch (err) {
    console.error(`  ⚠️  Embedding call failed: ${err}`);
    return null;
  }
}

async function logAnalysisPass(
  pool: Pool,
  packet: SummaryMessage,
  embedding: number[]
): Promise<void> {
  if (DRY_RUN) {
    return;
  }

  try {
    await pool.query(
      `
      INSERT INTO analysis_pass_results (
        pass_key, packet_key, source_ref, feature_id,
        pass_type, status,
        model_name,
        output, scores, index_push, provenance,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6,
        $7,
        $8, $9, $10, $11,
        NOW(), NOW()
      )
      `,
      [
        'embeddinggemma_summary_embed_v1',
        packet.packet_key,
        packet.source_ref,
        packet.feature_id,
        'embedding',
        'success',
        EMBEDDING_MODEL,
        JSON.stringify({
          embedding_dim: EMBEDDING_DIM,
          embedding_norm: Math.sqrt(embedding.reduce((a, b) => a + b * b, 0)),
        }),
        JSON.stringify({ magnitude: Math.sqrt(embedding.reduce((a, b) => a + b * b, 0)) }),
        JSON.stringify({
          postgres: true,
          qdrant: true,
          bitfrost: false,
          neo4j: false,
        }),
        JSON.stringify({
          source: 'queue_consumer_embedding',
          queue_message_id: `${packet.packet_key}:${Date.now()}`,
          identity: {
            identity_mutated: false,
            join_key: 'packet_key',
            fallback_join: `${packet.source_ref}:${packet.feature_id}`,
          },
        }),
      ]
    );
  } catch (err) {
    console.error(`  ✗ Failed to log pass: ${err}`);
  }
}

async function updateSummaryLayerEmbedding(
  pool: Pool,
  packet: SummaryMessage,
  embedding: number[]
): Promise<void> {
  if (DRY_RUN) {
    return;
  }

  try {
    await pool.query(
      `
      UPDATE atlas_summary_layers
      SET
        embedding = $2,
        embedding_model = $3,
        updated_at = NOW()
      WHERE packet_key = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [packet.packet_key, JSON.stringify(embedding), EMBEDDING_MODEL]
    );
  } catch (err) {
    console.error(`  ✗ Failed to update embedding: ${err}`);
  }
}

async function processMessage(
  channel: Channel,
  msg: Message
): Promise<void> {
  if (!msg) return;

  try {
    const packet: SummaryMessage = JSON.parse(msg.content.toString());

    console.log(`[${new Date().toISOString()}] Embedding ${packet.packet_key}...`);

    // Call EmbeddingGemma
    const embedding = await callEmbeddingGemma(packet.summary);

    if (!embedding) {
      console.log(`  ⚠️  Empty embedding`);
      channel.nack(msg, false, true); // requeue
      return;
    }

    // Log analysis pass
    await logAnalysisPass(pgPool, packet, embedding);

    // Update summary layer
    await updateSummaryLayerEmbedding(pgPool, packet, embedding);

    // Acknowledge message
    channel.ack(msg);
    console.log(`  ✅ Complete (${EMBEDDING_DIM}-dim)`);
  } catch (err) {
    console.error(`  ✗ Error: ${err}`);
    channel.nack(msg, false, false); // discard
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Phase B Queue Consumer — EmbeddingGemma Worker                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`RabbitMQ: ${RABBITMQ_URL}`);
  console.log(`Ollama: ${OLLAMA_URL}`);
  console.log(`Model: ${EMBEDDING_MODEL} (${EMBEDDING_DIM}-dim)\n`);

  let connection: Connection | null = null;
  let channel: Channel | null = null;

  try {
    // Connect to RabbitMQ
    console.log('📡 Connecting to RabbitMQ...');
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    // Declare queue and set prefetch
    await channel.assertQueue('atlas.enrichment.embedding', { durable: true });
    await channel.prefetch(1); // Process 1 message at a time

    console.log('✅ Connected to atlas.enrichment.embedding\n');
    console.log('🚀 Listening for messages (press Ctrl+C to stop)...\n');

    // Consume messages
    channel.consume('atlas.enrichment.embedding', (msg) => {
      if (msg) {
        processMessage(channel!, msg);
      }
    });
  } catch (err) {
    console.error(`❌ Error: ${err}`);
    process.exit(1);
  }

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down...');
    if (channel) await channel.close();
    if (connection) await connection.close();
    await pgPool.end();
    console.log('✅ Closed');
    process.exit(0);
  });
}

main();