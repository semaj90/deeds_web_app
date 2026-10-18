#!/usr/bin/env node
/**
 * RabbitMQ worker for canonical codebase chunk embeddings (768-D).
 * Consumes queue 'codebase.chunk.embed' ({ chunkIds: uuid[] }).
 *
 * Adheres strictly to Wire Format Layering:
 * - Producers publish chunk IDs / ID ranges only (never raw float embedding vectors).
 * - Consumer fetches source text and relative_path from PostgreSQL.
 * - Formats canonical task-prefix prompt: `title: {relative_path} | text: {content}`.
 * - Embeds in batch via Ollama `/api/embed` (768-D, L2 unit-norm).
 * - Updates PostgreSQL codebase_chunk_index.content_embedding (halfvec 768) in atomic batch.
 * - Acks message ONLY after successful PostgreSQL commit (prefetch=1).
 * - Poison/unhandled messages divert to 'codebase.chunk.embed.dlq'.
 *
 * Usage:
 *   node scripts/workers/codebase-chunk-embed-worker.mjs
 *   env vars: DATABASE_URL, RABBITMQ_URL, OLLAMA_URL, LEGAL_EMBED_MODEL
 */
import amqp from 'amqplib';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from '../atlas/connection-config.mjs';

const env = loadRepoEnv(process.env);
const DB_URL = resolveDatabaseUrl(env);
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@127.0.0.1:5672';
const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const EMBED_MODEL = process.env.LEGAL_EMBED_MODEL || 'embeddinggemma:latest';
const NEW_EMBEDDING_MODEL_TAG = 'embeddinggemma:latest:eg-task-prefix-v1';
const QUEUE = 'codebase.chunk.embed';
const DIM = 768;

const pool = new pg.Pool({
  connectionString: DB_URL,
  max: 2,
  connectionTimeoutMillis: 5000,
  statement_timeout: 60000,
});

function formatDocumentPrompt(content, title) {
  const normalized = content.trim();
  if (!normalized) throw new Error('EMPTY_CHUNK_CONTENT');
  return `title: ${title?.trim() || 'none'} | text: ${normalized}`;
}

async function embedBatch(texts) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: texts,
        truncate: true,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`OLLAMA_HTTP_${res.status}: ${await res.text()}`);
    const { embeddings } = await res.json();
    if (!Array.isArray(embeddings) || embeddings.length !== texts.length) {
      throw new Error('EMBED_COUNT_MISMATCH');
    }
    for (const v of embeddings) {
      if (!Array.isArray(v) || v.length !== DIM || !v.every(Number.isFinite)) {
        throw new Error('EMBED_DIM_INVALID');
      }
    }
    return embeddings;
  } finally {
    clearTimeout(timeout);
  }
}

async function handle(ch, msg) {
  if (!msg) return;
  try {
    const payload = JSON.parse(msg.content.toString());
    const chunkIds = payload.chunkIds;
    if (!Array.isArray(chunkIds) || !chunkIds.length) {
      throw new Error('BAD_PAYLOAD_MISSING_CHUNK_IDS');
    }

    const { rows } = await pool.query(
      `SELECT id, content, relative_path
       FROM codebase_chunk_index
       WHERE id = ANY($1::uuid[])
         AND content IS NOT NULL AND btrim(content) <> ''
         AND (embedding_model IS NULL OR embedding_model <> $2)`,
      [chunkIds, NEW_EMBEDDING_MODEL_TAG],
    );

    if (rows.length > 0) {
      const prompts = rows.map((r) => formatDocumentPrompt(r.content, r.relative_path));
      const vecs = await embedBatch(prompts);

      const updateIds = rows.map((r) => r.id);
      const updateVecs = vecs.map((v) => `[${v.join(',')}]`);

      await pool.query(
        `UPDATE codebase_chunk_index AS c
         SET content_embedding = u.vec::halfvec,
             embedding_model = $2,
             updated_at = now()
         FROM (
           SELECT unnest($1::uuid[]) AS id,
                  unnest($3::text[]) AS vec
         ) AS u
         WHERE c.id = u.id`,
        [updateIds, NEW_EMBEDDING_MODEL_TAG, updateVecs],
      );
    }

    ch.ack(msg);
  } catch (err) {
    console.error(`[codebase-embed-worker] Failed batch: ${err.message}`);
    // Requeue once; on redelivery error, nack to DLQ
    ch.nack(msg, false, !msg.fields.redelivered);
  }
}

async function start() {
  const conn = await amqp.connect(RABBITMQ_URL);
  const ch = await conn.createChannel();
  await ch.assertQueue(`${QUEUE}.dlq`, { durable: true });
  await ch.assertQueue(QUEUE, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': '',
      'x-dead-letter-routing-key': `${QUEUE}.dlq`,
    },
  });
  await ch.prefetch(1);
  console.log(`[codebase-embed-worker] Consuming ${QUEUE} (DLQ: ${QUEUE}.dlq)`);
  await ch.consume(QUEUE, (m) => handle(ch, m), { noAck: false });

  process.on('SIGINT', async () => {
    await ch.close();
    await conn.close();
    await pool.end();
    process.exit(0);
  });
}

// Export for programmatic use or direct CLI execution
export { handle, embedBatch, formatDocumentPrompt };

if (process.argv[1] && process.argv[1].endsWith('codebase-chunk-embed-worker.mjs')) {
  start().catch((err) => {
    console.error('[codebase-embed-worker] Fatal startup error:', err);
    process.exit(1);
  });
}
