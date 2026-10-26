#!/usr/bin/env node
/**
 * Producer script for SEM768-TP-04: RabbitMQ Distributed Chunk Workers.
 *
 * Slices pending codebase chunk IDs into bounded batches and publishes them
 * to RabbitMQ queue 'codebase.chunk.embed'.
 *
 * Wire format rule enforced:
 * - Messages carry chunk IDs only: `{ chunkIds: uuid[] }`.
 * - No raw float vectors are ever transmitted across RabbitMQ.
 *
 * Flags:
 *   --dry-run       Scan and partition chunk IDs, print stats, don't publish.
 *   --limit=N       Maximum chunks to enqueue (default: Infinity).
 *   --batch-size=N  Chunks per RabbitMQ message (default: 50).
 */
import amqp from 'amqplib';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitArg = args.find((v) => v.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.slice('--limit='.length)) : Infinity;
const batchArg = args.find((v) => v.startsWith('--batch-size='));
const BATCH_SIZE = batchArg ? Number(batchArg.slice('--batch-size='.length)) : 50;

const NEW_EMBEDDING_MODEL_TAG = 'embeddinggemma:latest:eg-task-prefix-v1';
const QUEUE = 'codebase.chunk.embed';
const DLQ = 'codebase.chunk.embed.dlq';

async function main() {
  const env = loadRepoEnv(process.env);
  const dbUrl = resolveDatabaseUrl(env);
  const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@127.0.0.1:5672';

  const pool = new pg.Pool({
    connectionString: dbUrl,
    max: 2,
    connectionTimeoutMillis: 5000,
  });

  console.log(`[enqueue-rabbitmq] Querying pending chunk IDs from PostgreSQL...`);
  const queryLimit = Number.isFinite(LIMIT) ? `LIMIT ${LIMIT}` : '';
  const { rows } = await pool.query(
    `SELECT id
     FROM codebase_chunk_index
     WHERE content IS NOT NULL AND btrim(content) <> ''
       AND (embedding_model IS NULL OR embedding_model <> $1)
     ORDER BY id
     ${queryLimit}`,
    [NEW_EMBEDDING_MODEL_TAG]
  );
  await pool.end();

  console.log(`[enqueue-rabbitmq] Found ${rows.length} pending chunks.`);
  if (rows.length === 0) {
    console.log(`[enqueue-rabbitmq] No pending chunks to enqueue.`);
    return;
  }

  // Partition into batches of BATCH_SIZE
  const messages = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunkIds = rows.slice(i, i + BATCH_SIZE).map((r) => r.id);
    messages.push({ chunkIds });
  }

  console.log(`[enqueue-rabbitmq] Partitioned into ${messages.length} messages (batch size: ${BATCH_SIZE}).`);

  if (DRY_RUN) {
    console.log(`[enqueue-rabbitmq] --dry-run specified: skipping publishing to RabbitMQ.`);
    console.log(JSON.stringify({
      dryRun: true,
      pendingChunks: rows.length,
      messagesPrepared: messages.length,
      sampleFirstMessageChunkCount: messages[0]?.chunkIds.length,
      sampleFirstMessageIds: messages[0]?.chunkIds.slice(0, 3),
    }, null, 2));
    return;
  }

  console.log(`[enqueue-rabbitmq] Connecting to RabbitMQ at ${rabbitmqUrl}...`);
  const conn = await amqp.connect(rabbitmqUrl);
  const ch = await conn.createChannel();

  // Ensure queues exist
  await ch.assertQueue(DLQ, { durable: true });
  await ch.assertQueue(QUEUE, {
    durable: true,
    deadLetterExchange: '',
    deadLetterRoutingKey: DLQ,
  });

  let published = 0;
  for (const msg of messages) {
    const content = Buffer.from(JSON.stringify(msg));
    ch.sendToQueue(QUEUE, content, {
      persistent: true,
      contentType: 'application/json',
    });
    published++;
  }

  console.log(`[enqueue-rabbitmq] Successfully published ${published} messages to '${QUEUE}'.`);
  await ch.close();
  await conn.close();
}

main().catch((err) => {
  console.error('[enqueue-rabbitmq] Fatal error:', err);
  process.exit(1);
});
