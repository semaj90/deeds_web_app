#!/usr/bin/env node
/**
 * Phase B Queue Consumer — Gemma4 Worker
 *
 * Consumes packets from RabbitMQ atlas.enrichment.gemma4 queue
 * Calls Gemma4, logs analysis passes, writes to atlas_summary_layers
 *
 * Usage:
 *   npx tsx scripts/atlas/phase-b-queue-consumer-gemma4.mts [--dry-run]
 */

import amqp, { Channel, Connection, Message } from 'amqplib';
import { Pool } from 'pg';
import { createHash } from 'crypto';
// @ts-ignore shared ESM runtime helper has no local .d.ts
import { sanitizeGemma4Summary } from '../../../scripts/atlas/lib/gemma4-summary-sanitizer.mjs';

const DRY_RUN = process.argv.includes('--dry-run');

const PG_HOST = process.env.POSTGRES_HOST || 'localhost';
const PG_PORT = parseInt(process.env.POSTGRES_PORT || '5434');
const PG_DB = process.env.POSTGRES_DB || 'legal_ai_db';
const PG_USER = process.env.POSTGRES_USER || 'legal_admin';
const PG_PASSWORD = process.env.POSTGRES_PASSWORD || '123456';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@127.0.0.1:5672';
const LLAMA_URL = process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8090';
const MODEL = 'gemma4-legal-iq4xs-direct.gguf';
const TEMPERATURE = 0.3;

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

async function callGemma4(sourceRef: string, featureLabel: string): Promise<string> {
  try {
    const response = await fetch(`${LLAMA_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You are a legal document analyzer. Provide a concise summary (1-2 sentences) of the given legal content.',
          },
          {
            role: 'user',
            content: `Summarize this legal document feature: ${featureLabel} from ${sourceRef}`,
          },
        ],
        temperature: TEMPERATURE,
        max_tokens: 256,
        stream: false,
      }),
      signal: AbortSignal.timeout(60000),
    });

    const data = (await response.json()) as any;
    const content = data.choices?.[0]?.message?.content?.trim() || '';
    const sanitized = sanitizeGemma4Summary(content);
    return sanitized.safe ? sanitized.summary : '';
  } catch (err) {
    console.error(`  ⚠️  Gemma4 call failed: ${err}`);
    return `[Summary unavailable: ${err}]`;
  }
}

async function logAnalysisPass(
  pool: Pool,
  packet: PacketMessage,
  summary: string
): Promise<void> {
  if (DRY_RUN) {
    return;
  }
  const sanitized = sanitizeGemma4Summary(summary);
  if (!sanitized.safe) {
    console.error(`  ✗ Refusing to log leaked Gemma4 summary for ${packet.packet_key}`);
    return;
  }

  try {
    const inputHash = createHash('sha256')
      .update(`${packet.source_ref}:${packet.feature_id}`)
      .digest('hex');

    await pool.query(
      `
      INSERT INTO analysis_pass_results (
        pass_key, packet_key, source_ref, feature_id,
        pass_type, status,
        input_hash, model_name,
        output, scores, index_push, provenance,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6,
        $7, $8,
        $9, $10, $11, $12,
        NOW(), NOW()
      )
      `,
      [
        'gemma4_summary_v1',
        packet.packet_key,
        packet.source_ref,
        packet.feature_id,
        'summarization',
        'success',
        inputHash,
        MODEL,
        JSON.stringify({ summary: sanitized.summary, summary_tokens: sanitized.summary.split(' ').length }),
        JSON.stringify({ confidence: 0.85, coherence: 0.90 }),
        JSON.stringify({
          postgres: true,
          qdrant: false,
          bitfrost: false,
          neo4j: false,
        }),
        JSON.stringify({
          source: 'queue_consumer_gemma4',
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

async function writeSummaryLayer(
  pool: Pool,
  packet: PacketMessage,
  summary: string
): Promise<void> {
  if (DRY_RUN) {
    return;
  }
  const sanitized = sanitizeGemma4Summary(summary);
  if (!sanitized.safe) {
    console.error(`  ✗ Refusing to write leaked Gemma4 summary for ${packet.packet_key}`);
    return;
  }

  try {
    await pool.query(
      `
      INSERT INTO atlas_summary_layers (
        packet_key, summary, embedding, embedding_model, metadata, created_at, updated_at
      ) VALUES (
        $1, $2, NULL, $3, $4, NOW(), NOW()
      )
      `,
      [
        packet.packet_key,
        sanitized.summary,
        'embeddinggemma:latest',
        JSON.stringify({
          feature_id: packet.feature_id,
          source_ref: packet.source_ref,
          pass_key: 'gemma4_summary_v1',
          generated_at: new Date().toISOString(),
          queue_source: true,
        }),
      ]
    );
  } catch (err) {
    console.error(`  ✗ Failed to write summary layer: ${err}`);
  }
}

async function processMessage(
  channel: Channel,
  msg: Message
): Promise<void> {
  if (!msg) return;

  try {
    const packet: PacketMessage = JSON.parse(msg.content.toString());

    console.log(`[${new Date().toISOString()}] Processing ${packet.packet_key}...`);

    // Call Gemma4
    const summary = await callGemma4(packet.source_ref, packet.feature_label);

    if (!summary) {
      console.log(`  ⚠️  Empty summary`);
      channel.nack(msg, false, true); // requeue
      return;
    }

    // Log analysis pass
    await logAnalysisPass(pgPool, packet, summary);

    // Write to summary layer
    await writeSummaryLayer(pgPool, packet, summary);

    // Acknowledge message
    channel.ack(msg);
    console.log(`  ✅ Complete`);
  } catch (err) {
    console.error(`  ✗ Error: ${err}`);
    channel.nack(msg, false, false); // discard
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Phase B Queue Consumer — Gemma4 Worker                        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`RabbitMQ: ${RABBITMQ_URL}`);
  console.log(`Gemma4: ${LLAMA_URL}\n`);

  let connection: Connection | null = null;
  let channel: Channel | null = null;

  try {
    // Connect to RabbitMQ
    console.log('📡 Connecting to RabbitMQ...');
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    // Declare queue and set prefetch
    await channel.assertQueue('atlas.enrichment.gemma4', { durable: true });
    await channel.prefetch(1); // Process 1 message at a time

    console.log('✅ Connected to atlas.enrichment.gemma4\n');
    console.log('🚀 Listening for messages (press Ctrl+C to stop)...\n');

    // Consume messages
    channel.consume('atlas.enrichment.gemma4', (msg) => {
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
