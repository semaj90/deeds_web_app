#!/usr/bin/env node
/**
 * atlas-qdrant-projection-worker — CPU worker for Qdrant payload projection.
 *
 * Consumes jobs from atlas.qdrant.project, loads canonical Postgres data,
 * validates against the Qdrant payload contract, and upserts into Qdrant.
 *
 * Architecture:
 *   RabbitMQ message
 *     → load canonical Postgres row (atlas_packets + codebase_chunk_index)
 *     → validate identity and contract
 *     → build deterministic Qdrant payload
 *     → compute projection hash
 *     → PATCH_PAYLOAD / UPSERT_POINT / DELETE_POINT
 *     → record success in atlas_qdrant_projection_state
 *     → ACK message
 *
 * On failure: NACK → retry queue (30s TTL, up to 5 attempts) → dead queue.
 *
 * Usage:
 *   node scripts/atlas/atlas-qdrant-projection-worker.mjs
 *   ATLAS_PREFETCH=4 node scripts/atlas/atlas-qdrant-projection-worker.mjs
 */

import pg       from 'pg';
import amqp     from 'amqplib';
import { createHash } from 'crypto';

const QDRANT_URL  = process.env.QDRANT_URL   ?? 'http://localhost:6333';
const COLLECTION  = process.env.ATLAS_COLLECTION ?? 'codebase_chunks_384_hybrid';
const PREFETCH    = parseInt(process.env.ATLAS_PREFETCH ?? '8');
const QUEUE       = process.env.ATLAS_QUEUE   ?? 'atlas.qdrant.project';
const MAX_RETRIES = 5;
const CONTRACT_VERSION  = 'atlas-qdrant-384-hybrid-v1';
const METADATA_SCHEMA   = 'atlas-semantic-metadata-v1';

const RABBITMQ_URL = process.env.RABBITMQ_URL
  ?? `amqp://${process.env.RABBITMQ_USER ?? 'guest'}:${process.env.RABBITMQ_PASSWORD ?? 'guest'}@${process.env.RABBITMQ_HOST ?? 'localhost'}:${process.env.RABBITMQ_PORT ?? '5672'}`;

const pool = new pg.Pool({
  host:     process.env.PG_HOST     ?? 'localhost',
  port:     parseInt(process.env.PG_PORT ?? '5434'),
  user:     process.env.PG_USER     ?? 'legal_admin',
  password: process.env.PG_PASSWORD ?? '123456',
  database: process.env.PG_DATABASE ?? 'legal_ai_db',
  max: parseInt(process.env.PG_POOL_SIZE ?? '8'),
});

// Ensure projection state table exists
await pool.query(`
  CREATE TABLE IF NOT EXISTS atlas_qdrant_projection_state (
    packet_id          text PRIMARY KEY,
    qdrant_point_id    text NOT NULL,
    collection_name    text NOT NULL,
    contract_version   text NOT NULL,
    metadata_version   integer NOT NULL DEFAULT 1,
    payload_hash       text NOT NULL,
    projection_status  text NOT NULL DEFAULT 'PROJECTED',
    last_error         text,
    projected_at       timestamptz NOT NULL DEFAULT NOW(),
    updated_at         timestamptz NOT NULL DEFAULT NOW()
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS atlas_projection_jobs (
    id             text PRIMARY KEY,
    packet_id      text NOT NULL,
    qdrant_point_id text NOT NULL,
    collection_name text NOT NULL,
    operation      text NOT NULL DEFAULT 'PATCH_PAYLOAD',
    requested_version integer NOT NULL DEFAULT 1,
    status         text NOT NULL DEFAULT 'PUBLISHED',
    attempts       integer NOT NULL DEFAULT 0,
    last_error     text,
    available_at   timestamptz NOT NULL DEFAULT NOW(),
    created_at     timestamptz NOT NULL DEFAULT NOW(),
    updated_at     timestamptz NOT NULL DEFAULT NOW()
  )
`);

console.log('=== Atlas Qdrant Projection Worker ===');
console.log(`Queue      : ${QUEUE}`);
console.log(`Prefetch   : ${PREFETCH}`);
console.log(`Collection : ${COLLECTION}`);
console.log(`Qdrant     : ${QDRANT_URL}`);
console.log('');

function canonicalHash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/**
 * Load the canonical projection data from Postgres for a chunk.
 * Joins codebase_chunk_index (embedding source) with atlas_packets (identity).
 */
async function loadProjection(chunkId) {
  const { rows } = await pool.query(`
    SELECT
      cci.id::text                     AS chunk_id,
      cci.source_ref,
      cci.content_hash,
      cci.language,
      cci.domain_class,
      cci.kmeans_cluster,
      cci.kmeans_model_version,
      cci.kmeans_vector_contract,
      cci.cluster_margin,
      ap.packet_key,
      ap.domain_class                  AS packet_domain_class,
      ap.summary                       AS packet_summary
    FROM codebase_chunk_index cci
    LEFT JOIN atlas_packets ap ON ap.source_ref = cci.source_ref
    WHERE cci.id = $1::uuid
  `, [chunkId]);

  if (rows.length === 0) throw new Error(`Chunk not found: ${chunkId}`);
  return rows[0];
}

function buildPayload(row, jobSourceRef, jobPacketKey) {
  const packet_key = row.packet_key ?? jobPacketKey ?? `chunk:${row.chunk_id}`;
  const source_ref = row.source_ref ?? jobSourceRef;

  if (!packet_key) throw new Error(`Missing packet_key for chunk ${row.chunk_id}`);
  if (!source_ref) throw new Error(`Missing source_ref for chunk ${row.chunk_id}`);

  const payload = {
    // Identity contract — required fields
    packet_key,
    source_ref,
    postgres_id: row.chunk_id,
    content_hash: row.content_hash ?? null,

    // Collection contract version
    contract_version: CONTRACT_VERSION,
    metadata_schema:  METADATA_SCHEMA,
    metadata_version: 1,

    // Source metadata
    language:     row.language     ?? null,
    domain_class: row.packet_domain_class ?? row.domain_class ?? null,

    // Cluster routing (768-dim model, labeled as experimental/analysis)
    kmeans_cluster:         row.kmeans_cluster         ?? null,
    kmeans_model_version:   row.kmeans_model_version   ?? null,
    kmeans_vector_contract: row.kmeans_vector_contract ?? null,
    cluster_margin:         row.cluster_margin         ?? null,

    // Embedding contract
    embedding_model:     'embeddinggemma-300m',
    embedding_dimension: 384,
    indexed_at: new Date().toISOString(),
  };

  return payload;
}

async function qdrantSetPayload(pointId, payload) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, points: [pointId], wait: true }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Qdrant setPayload failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

async function qdrantUpsert(pointId, vector, payload) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points?wait=true`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      points: [{ id: pointId, vector: { content_384: vector }, payload }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Qdrant upsert failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

async function recordSuccess(jobId, chunkId, pointId, contractVersion, payloadHash) {
  await pool.query(`
    INSERT INTO atlas_qdrant_projection_state
      (packet_id, qdrant_point_id, collection_name, contract_version, metadata_version,
       payload_hash, projection_status, projected_at, updated_at)
    VALUES ($1, $2, $3, $4, 1, $5, 'PROJECTED', NOW(), NOW())
    ON CONFLICT (packet_id) DO UPDATE SET
      qdrant_point_id    = EXCLUDED.qdrant_point_id,
      collection_name    = EXCLUDED.collection_name,
      contract_version   = EXCLUDED.contract_version,
      metadata_version   = 1,
      payload_hash       = EXCLUDED.payload_hash,
      projection_status  = 'PROJECTED',
      projected_at       = NOW(),
      last_error         = NULL,
      updated_at         = NOW()
  `, [chunkId, pointId, COLLECTION, contractVersion, payloadHash]);

  if (jobId !== chunkId) {
    await pool.query(
      `UPDATE atlas_projection_jobs SET status='SUCCEEDED', last_error=NULL, updated_at=NOW() WHERE id=$1`,
      [jobId]
    );
  }
}

async function recordFailure(jobId, error) {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  const { rows } = await pool.query(`
    INSERT INTO atlas_projection_jobs (id, packet_id, qdrant_point_id, collection_name, operation, status, attempts, last_error, updated_at)
    VALUES ($1, $1, $1, $2, 'PATCH_PAYLOAD', 'RETRY', 1, $3, NOW())
    ON CONFLICT (id) DO UPDATE SET
      attempts    = atlas_projection_jobs.attempts + 1,
      status      = CASE WHEN atlas_projection_jobs.attempts + 1 >= $4 THEN 'DEAD' ELSE 'RETRY' END,
      last_error  = $3,
      updated_at  = NOW()
    RETURNING attempts
  `, [jobId, COLLECTION, message, MAX_RETRIES]);
  return rows[0]?.attempts ?? MAX_RETRIES;
}

async function processMessage(msg, channel) {
  let job;
  try {
    job = JSON.parse(msg.content.toString('utf8'));
  } catch {
    // Unparseable — reject without requeue
    channel.reject(msg, false);
    return;
  }

  const chunkId = job.packet_id ?? job.id;
  const pointId = job.qdrant_point_id ?? chunkId;
  const operation = job.operation ?? 'PATCH_PAYLOAD';

  try {
    const row = await loadProjection(chunkId);
    const payload = buildPayload(row, job.source_ref, job.packet_key);
    const payloadHash = canonicalHash(payload);

    if (operation === 'UPSERT_POINT') {
      // Would need vector — not available in payload-only path; treat as PATCH_PAYLOAD
      await qdrantSetPayload(pointId, payload);
    } else if (operation === 'PATCH_PAYLOAD' || operation === 'OVERWRITE_PAYLOAD') {
      await qdrantSetPayload(pointId, payload);
    } else if (operation === 'DELETE_POINT') {
      const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/delete?wait=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: [pointId] }),
      });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
    }

    await recordSuccess(job.id ?? chunkId, chunkId, pointId, CONTRACT_VERSION, payloadHash);
    channel.ack(msg);
    process.stdout.write('.');

  } catch (err) {
    const attempts = await recordFailure(job.id ?? chunkId, err).catch(() => MAX_RETRIES);
    console.error(`\nJob ${chunkId} failed (attempt ${attempts}): ${err.message?.slice(0, 100)}`);

    if (attempts >= MAX_RETRIES) {
      channel.reject(msg, false); // → dead queue
    } else {
      // Route to retry queue (30s TTL)
      channel.nack(msg, false, false);
      try {
        channel.publish('atlas.projection', 'retry', msg.content, {
          persistent: true,
          contentType: 'application/json',
          messageId: job.id ?? chunkId,
        });
      } catch { /* ignore publish error on shutdown */ }
    }
  }
}

// ── Connect and consume ───────────────────────────────────────────────────────
const connection = await amqp.connect(RABBITMQ_URL);
const channel    = await connection.createChannel();

await channel.prefetch(PREFETCH);

await channel.consume(QUEUE, (msg) => {
  if (!msg) return;
  processMessage(msg, channel);
}, { noAck: false });

console.log(`Worker listening on ${QUEUE} (prefetch=${PREFETCH})...`);
console.log('Press Ctrl+C to stop.\n');

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await channel.close().catch(() => {});
  await connection.close().catch(() => {});
  await pool.end();
  process.exit(0);
});
