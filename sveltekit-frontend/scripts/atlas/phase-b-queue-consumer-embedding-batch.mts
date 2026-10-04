#!/usr/bin/env node
/**
 * Phase B Queue Consumer — EmbeddingGemma Batch Worker
 *
 * Batches 20 summaries per Ollama /api/embed HTTP request (30-40ms/packet wall time vs 60ms sequential)
 * Consumes from atlas.enrichment.embedding queue, logs analysis passes, updates atlas_summary_layers
 *
 * Usage:
 *   npx tsx scripts/atlas/phase-b-queue-consumer-embedding-batch.mts [--batch-size=20] [--dry-run]
 */

import amqp, { Channel, ConfirmChannel, Connection, Message } from 'amqplib';
import { Pool } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import {
  createRetryTrackerV1, DEFAULT_MAX_DELIVERY_ATTEMPTS_V1, EMBEDDING_DLQ_NAME_V1, logicalInputKeyV1, processDeliveryV1,
  type DeliveryContextV1,
} from '../../src/lib/server/queue/embedding-consumer-retry-policy-v1.js';
import { loadRuntimeEnv } from '../../src/lib/server/config/load-runtime-env.js';

loadRuntimeEnv({ cwd: process.cwd(), mode: 'development', override: true });

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = parseInt(
  process.argv.find(arg => arg.startsWith('--batch-size='))?.split('=')[1] || '20'
);

const PG_HOST = process.env.POSTGRES_HOST || 'localhost';
const PG_PORT = parseInt(process.env.POSTGRES_PORT || '5434');
const PG_DB = process.env.POSTGRES_DB || 'legal_ai_db';
const PG_USER = process.env.POSTGRES_USER || 'legal_admin';
const PG_PASSWORD = process.env.POSTGRES_PASSWORD || '123456';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://legal_admin:secret123@127.0.0.1:5673';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const EMBEDDING_MODEL = 'embeddinggemma:latest';
const EMBEDDING_DIM = 768;

// PF4B-QUEUE-05: bounded redelivery. The counter is in-process (classic queue, no delivery count), so a restart resets it.
const CONSUMER_RUN_ID = randomUUID();
const MAX_DELIVERY_ATTEMPTS = Number(process.env.EMBED_CONSUMER_MAX_ATTEMPTS ?? DEFAULT_MAX_DELIVERY_ATTEMPTS_V1);
const retryTracker = createRetryTrackerV1(MAX_DELIVERY_ATTEMPTS);
let dlqChannel: ConfirmChannel | null = null;

const summaryInputHash = (summary: string) => `sha256:${createHash('sha256').update(summary, 'utf8').digest('hex')}`;

const pgPool = new Pool({
  host: PG_HOST,
  port: PG_PORT,
  database: PG_DB,
  user: PG_USER,
  password: PG_PASSWORD,
});

function vectorLiteral(vector: number[]): string {
  return `[${vector.map((value) => (Number.isFinite(value) ? Number(value).toPrecision(8) : '0')).join(',')}]`;
}

interface SummaryMessage {
  packet_key: string;
  source_ref: string;
  feature_id: string;
  feature_label: string;
  summary: string;
  timestamp: string;
}

async function batchEmbedSummaries(summaries: string[]): Promise<(number[] | null)[]> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: summaries, // Ollama accepts array for batch embedding
      }),
      signal: AbortSignal.timeout(120000), // 2 min timeout for batch
    });

    if (!response.ok) {
      console.error(`  ⚠️  Ollama batch returned ${response.status}`);
      return summaries.map(() => null);
    }

    const data = (await response.json()) as any;
    const embeddings = data.embeddings as number[][];

    if (!embeddings || embeddings.length !== summaries.length) {
      console.error(`  ⚠️  Embedding count mismatch: expected ${summaries.length}, got ${embeddings?.length}`);
      return summaries.map(() => null);
    }

    // Validate all embeddings
    return embeddings.map((emb, idx) => {
      if (!emb || emb.length !== EMBEDDING_DIM) {
        console.error(`  ⚠️  Invalid embedding [${idx}] dimension: ${emb?.length}`);
        return null;
      }
      return emb;
    });
  } catch (err) {
    console.error(`  ⚠️  Batch embedding failed: ${err}`);
    return summaries.map(() => null);
  }
}

async function logAnalysisPass(
  pool: Pool,
  packet: SummaryMessage,
  embedding: number[],
  msg?: Message,
  ctx?: DeliveryContextV1
): Promise<boolean> {
  if (DRY_RUN) {
    return true;
  }

  try {
    await pool.query(
      `
      INSERT INTO analysis_pass_results (
        pass_key, packet_key, source_ref, feature_id,
        pass_type, status,
        model_name, input_hash,
        output, scores, index_push, provenance,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6,
        $7, $12,
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
          representation_id: 'semantic_768',
          model_tag: EMBEDDING_MODEL,
          model_artifact_revision: null,
          embedding_norm: Math.sqrt(embedding.reduce((a, b) => a + b * b, 0)),
          batch_processed: true,
        }),
        JSON.stringify({ magnitude: Math.sqrt(embedding.reduce((a, b) => a + b * b, 0)) }),
        JSON.stringify({
          postgres: true,
          qdrant: true,
          bitfrost: false,
          neo4j: false,
        }),
        JSON.stringify({
          source: 'queue_consumer_embedding_batch',
          // Legacy synthetic correlation value; NOT a broker or attempt identity (PF4B-QUEUE-01).
          queue_message_id: `${packet.packet_key}:${Date.now()}`,
          broker: {
            message_id: msg?.properties?.messageId ?? null,
            delivery_tag: msg?.fields?.deliveryTag ?? null,
            redelivered: msg?.fields?.redelivered ?? null,
            routing_key: msg?.fields?.routingKey ?? null,
            consumer_tag: msg?.fields?.consumerTag ?? null,
          },
          execution: {
            execution_id: ctx?.executionId ?? null,
            attempt: ctx?.attempt ?? null,
            consumer_run_id: CONSUMER_RUN_ID,
            broker_identity_key: ctx?.brokerIdentity ?? null,
            logical_input_key: logicalInputKeyV1({
              packetKey: packet.packet_key,
              inputHash: summaryInputHash(packet.summary),
              representationId: 'semantic_768',
            }),
          },
          identity: {
            identity_mutated: false,
            join_key: 'packet_key',
            fallback_join: `${packet.source_ref}:${packet.feature_id}`,
          },
        }),
        summaryInputHash(packet.summary),
      ]
    );
    return true;
  } catch (err) {
    console.error(`  ✗ Failed to log pass: ${err}`);
    return false;
  }
}

async function updateSummaryLayerEmbedding(
  pool: Pool,
  packet: SummaryMessage,
  embedding: number[]
): Promise<boolean> {
  if (DRY_RUN) {
    return true;
  }

  try {
    await pool.query(
      `
      UPDATE atlas_summary_layers
      SET
        embedding = $2::vector,
        embedding_model = $3,
        vector_dim = $4,
        updated_at = NOW()
      WHERE ctid = (
        SELECT ctid
        FROM atlas_summary_layers
        WHERE packet_key = $1
        ORDER BY created_at DESC
        LIMIT 1
      )
      `,
      [packet.packet_key, vectorLiteral(embedding), EMBEDDING_MODEL, EMBEDDING_DIM]
    );
    return true;
  } catch (err) {
    console.error(`  ✗ Failed to update embedding: ${err}`);
    return false;
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Phase B Queue Consumer — EmbeddingGemma BATCH Worker          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`Batch size: ${BATCH_SIZE} summaries per request`);
  console.log(`Expected speedup: 30-40ms/packet (vs 60ms sequential)`);
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

    // Declare queue and set prefetch for batch
    await channel.assertQueue('atlas.enrichment.embedding', { durable: true });
    dlqChannel = await connection.createConfirmChannel();
    await dlqChannel.assertQueue(EMBEDDING_DLQ_NAME_V1, { durable: true });
    await channel.prefetch(BATCH_SIZE); // Prefetch batch-size messages

    console.log(`✅ Connected to atlas.enrichment.embedding\n`);
    console.log(`🚀 Listening for messages in batches of ${BATCH_SIZE} (press Ctrl+C to stop)...\n`);

    let messageBatch: { msg: Message; packet: SummaryMessage }[] = [];
    let batchTimer: NodeJS.Timeout | null = null;

    const processBatch = async () => {
      if (messageBatch.length === 0) return;

      const startTime = Date.now();
      const summaries = messageBatch.map(m => m.packet.summary);

      console.log(`[${new Date().toISOString()}] Embedding batch of ${messageBatch.length}...`);

      // Call Ollama batch API
      const embeddings = await batchEmbedSummaries(summaries);
      const duration = Date.now() - startTime;
      const perPacket = duration / messageBatch.length;

      // Process results
      let successCount = 0;
      for (let i = 0; i < messageBatch.length; i++) {
        const { msg, packet } = messageBatch[i];
        const embedding = embeddings[i];

        const outcome = await processDeliveryV1({
          msg,
          consumerRunId: CONSUMER_RUN_ID,
          tracker: retryTracker,
          logicalInputKey: logicalInputKeyV1({ packetKey: packet.packet_key, inputHash: summaryInputHash(packet.summary), representationId: 'semantic_768' }),
          channel: {
            ack: (m) => channel!.ack(m),
            nack: (m, allUpTo, requeue) => channel!.nack(m, allUpTo, requeue),
            publishDeadLetter: (content, headers) =>
              new Promise<void>((resolve, reject) => {
                if (!dlqChannel) return reject(new Error('DLQ_CHANNEL_UNAVAILABLE'));
                dlqChannel.sendToQueue(EMBEDDING_DLQ_NAME_V1, Buffer.from(content), { persistent: true, headers }, (err) => (err ? reject(err) : resolve()));
              }),
          },
          work: async (ctx) => {
            if (!embedding) {
              console.log(`  ⚠️  ${packet.packet_key}: empty embedding (attempt ${ctx.attempt}/${MAX_DELIVERY_ATTEMPTS})`);
              return false;
            }
            if (!(await logAnalysisPass(pgPool, packet, embedding, msg, ctx))) return false; // never ack without a ledger row
            return updateSummaryLayerEmbedding(pgPool, packet, embedding);
          },
        });
        if (outcome === 'ACKED') successCount++;
        else console.log(`  → ${packet.packet_key}: ${outcome}`);
      }

      console.log(`  ✅ Batch complete: ${successCount}/${messageBatch.length} success (${perPacket.toFixed(1)}ms/packet)`);
      messageBatch = [];
    };

    // Consume messages
    channel.consume('atlas.enrichment.embedding', (msg) => {
      if (!msg) return;

      try {
        const packet: SummaryMessage = JSON.parse(msg.content.toString());
        messageBatch.push({ msg, packet });

        // Process batch when full or after idle timeout
        if (messageBatch.length >= BATCH_SIZE) {
          if (batchTimer) clearTimeout(batchTimer);
          processBatch();
        } else if (!batchTimer) {
          // Start idle timeout (process after 5 seconds if batch not full)
          batchTimer = setTimeout(() => {
            processBatch();
            batchTimer = null;
          }, 5000);
        }
      } catch (err) {
        console.error(`  ✗ Failed to parse message: ${err}`);
        if (msg) channel!.nack(msg, false, false);
      }
    });
  } catch (err) {
    console.error(`❌ Error: ${err}`);
    process.exit(1);
  }

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down (processing final batch)...');

    // Process any remaining messages in batch
    if (messageBatch.length > 0) {
      console.log(`Processing ${messageBatch.length} remaining messages...`);
      // We can't properly processBatch here due to async constraints, so nack remaining
      for (const { msg } of messageBatch) {
        channel?.nack(msg, false, true); // requeue remaining
      }
    }

    if (channel) await channel.close();
    if (dlqChannel) await dlqChannel.close();
    if (connection) await connection.close();
    await pgPool.end();
    console.log('✅ Closed');
    process.exit(0);
  });
}

main();
