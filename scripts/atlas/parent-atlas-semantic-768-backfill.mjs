#!/usr/bin/env node

/**
 * Parent Atlas — Canonical semantic_768 embedding backfill
 *
 * Integration contract:
 *   - Postgres defines canonical packet existence and embedding state.
 *   - AST/tree_node_id defines code structure; this script never derives AST identity.
 *   - Ontology/Neo4j/Qdrant/SOM/latent lanes are downstream projections.
 *   - Qdrant mirrors semantic neighbors only after the Postgres write succeeds.
 *   - Legacy content_embedding_384 is reported for migration visibility but never selected as canonical or written.
 *
 * Legacy packet representation (not the active code-chunk authority):
 *   representation: semantic_768
 *   model:          embeddinggemma:latest (configurable)
 *   dimension:      768
 *   distance:       cosine
 *   storage:        atlas_packets.embedding :: vector(768)
 *
 * Usage:
 *   node backfill-embedding-lane-768.mjs --dry-run --max-packets=32
 *   ATLAS_AUTHORIZE_SEMANTIC_768_BACKFILL=1 node backfill-embedding-lane-768.mjs --apply --max-packets=5000 --batch-size=32
 *   node backfill-embedding-lane-768.mjs --verify-only
 *
 * Environment:
 *   DATABASE_URL       defaults to host-side Postgres proxy 127.0.0.1:5434
 *   OLLAMA_URL         defaults to http://127.0.0.1:11434
 *   EMBEDDING_MODEL    defaults to embeddinggemma:latest
 *   MODEL_REVISION     stable model digest/revision strongly recommended
 */

import pg from 'pg';
import crypto from 'node:crypto';

const { Pool } = pg;

const REPRESENTATION_NAME = 'semantic_768';
const REPRESENTATION_SCHEMA = 'atlas.representation.v1';
const EMBEDDING_DIM = 768;
const DEFAULT_DATABASE_URL = 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

function parsePositiveInteger(name, value, fallback) {
  if (value == null) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer; received ${value}`);
  }
  return parsed;
}

function parseArgs(argv) {
  const args = new Map();
  const flags = new Set();

  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const equals = arg.indexOf('=');
    if (equals === -1) {
      flags.add(arg.slice(2));
    } else {
      args.set(arg.slice(2, equals), arg.slice(equals + 1));
    }
  }

  const apply = flags.has('apply');
  const dryRun = flags.has('dry-run') || !apply;

  if (flags.has('apply') && flags.has('dry-run')) {
    throw new Error('Choose either --apply or --dry-run, not both');
  }

  return {
    apply,
    dryRun,
    verifyOnly: flags.has('verify-only'),
    resume: flags.has('resume'),
    maxPackets: parsePositiveInteger('max-packets', args.get('max-packets'), 5000),
    batchSize: parsePositiveInteger('batch-size', args.get('batch-size'), 32),
    concurrency: parsePositiveInteger('concurrency', args.get('concurrency'), 1),
    workerId: args.get('worker-id') ?? `semantic-768-${process.pid}-${Date.now()}`,
  };
}

const options = parseArgs(process.argv.slice(2));

if (options.apply && process.env.ATLAS_AUTHORIZE_SEMANTIC_768_BACKFILL !== '1') {
  throw new Error('EXPLICIT_SEMANTIC_768_BACKFILL_AUTHORIZATION_REQUIRED');
}

const DATABASE_URL = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
const OLLAMA_URL = (process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
const MODEL = process.env.EMBEDDING_MODEL ?? 'embeddinggemma:latest';
if (!/^embeddinggemma(?::|$)/i.test(MODEL)) {
  throw new Error(`CANONICAL_EMBEDDING_MODEL_REQUIRED:received=${MODEL}`);
}
const MODEL_REVISION = process.env.MODEL_REVISION ?? MODEL;
const PREPROCESSING_VERSION = process.env.PREPROCESSING_VERSION ?? 'semantic-768-v1';
const REQUEST_TIMEOUT_MS = parsePositiveInteger(
  'EMBEDDING_TIMEOUT_MS',
  process.env.EMBEDDING_TIMEOUT_MS,
  120_000
);

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: Math.max(4, options.concurrency + 2),
  application_name: 'parent-atlas-semantic-768-backfill',
});

function hashContent(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function embeddingKey({ contentHash }) {
  const key = [
    REPRESENTATION_SCHEMA,
    REPRESENTATION_NAME,
    MODEL,
    MODEL_REVISION,
    EMBEDDING_DIM,
    PREPROCESSING_VERSION,
    contentHash,
  ].join(':');

  return crypto.createHash('sha256').update(key).digest('hex');
}

function buildEmbeddingText(packet) {
  const text = packet.summary || packet.title || packet.source_ref || '';
  return String(text).trim().slice(0, 8_000);
}

function vectorLiteral(vector) {
  return `[${vector.join(',')}]`;
}

function validateVector(vector, index) {
  if (!Array.isArray(vector)) {
    throw new Error(`Embedding ${index} is not an array`);
  }
  if (vector.length !== EMBEDDING_DIM) {
    throw new Error(`Embedding ${index} has dimension ${vector.length}; expected ${EMBEDDING_DIM}`);
  }
  for (let i = 0; i < vector.length; i++) {
    if (!Number.isFinite(vector[i])) {
      throw new Error(`Embedding ${index} contains a non-finite value at offset ${i}`);
    }
  }
  const normSquared = vector.reduce((sum, value) => sum + value * value, 0);
  if (!Number.isFinite(normSquared) || normSquared < 0.98 || normSquared > 1.02) {
    throw new Error(`Embedding ${index} is not L2-normalized; normSquared=${normSquared}`);
  }
}

async function embedBatch(texts) {
  const response = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      input: texts,
      dimensions: EMBEDDING_DIM,
      truncate: true,
      keep_alive: '30m',
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama embed failed: ${response.status} ${body}`);
  }

  const result = await response.json();
  if (!Array.isArray(result.embeddings)) {
    throw new Error('Ollama returned no embeddings array');
  }
  if (result.embeddings.length !== texts.length) {
    throw new Error(
      `Embedding count mismatch: expected ${texts.length}, got ${result.embeddings.length}`
    );
  }

  result.embeddings.forEach(validateVector);
  return result.embeddings;
}

async function verifySchemaAndRuntime() {
  await pool.query('SELECT 1');

  const schemaResult = await pool.query(`
    SELECT format_type(a.atttypid, a.atttypmod) AS declared_type
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'atlas_packets'
      AND a.attname = 'embedding'
      AND a.attnum > 0
      AND NOT a.attisdropped
  `);

  if (schemaResult.rowCount !== 1) {
    throw new Error('public.atlas_packets.embedding was not found');
  }

  const declaredType = schemaResult.rows[0].declared_type;
  if (!/^(vector|halfvec)\(768\)$/.test(declaredType)) {
    throw new Error(
      `atlas_packets.embedding must be vector(768) or halfvec(768); found ${declaredType}`
    );
  }

  const testVectors = await embedBatch(['Parent Atlas semantic_768 readiness probe']);
  validateVector(testVectors[0], 0);

  return { declaredType, runtimeDimension: testVectors[0].length };
}

async function readCoverage() {
  const result = await pool.query(`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE embedding IS NOT NULL)::bigint AS any_embedding,
      COUNT(*) FILTER (
        WHERE embedding IS NOT NULL
          AND embedding_status = 'success'
      )::bigint AS canonical_success,
      COUNT(*) FILTER (
        WHERE content_embedding_384 IS NOT NULL
      )::bigint AS legacy_384,
      COUNT(*) FILTER (
        WHERE embedding IS NULL
      )::bigint AS missing_768
    FROM atlas_packets
  `);

  const row = result.rows[0];
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]));
}

async function selectDryRunBatch(limit, offset) {
  const result = await pool.query(
    `SELECT
       packet_id,
       packet_key,
       source_ref,
       sha256,
       summary,
       payload->>'title' AS title
     FROM atlas_packets
     WHERE embedding IS NULL
       AND (
         embedding_status IS NULL
         OR embedding_status IN ('pending', 'failed')
       )
     ORDER BY packet_id
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return result.rows;
}

async function claimPackets(limit, workerId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `WITH candidates AS (
         SELECT packet_id
         FROM atlas_packets
         WHERE embedding IS NULL
           AND (
             embedding_status IS NULL
             OR embedding_status IN ('pending', 'failed')
             OR (
               embedding_status = 'processing'
               AND embedding_claimed_at < NOW() - INTERVAL '20 minutes'
             )
           )
         ORDER BY packet_id
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       UPDATE atlas_packets p
       SET
         embedding_status = 'processing',
         embedding_claimed_at = NOW(),
         embedding_claimed_by = $2,
         embedding_timestamp = NOW()
       FROM candidates c
       WHERE p.packet_id = c.packet_id
       RETURNING
         p.packet_id,
         p.packet_key,
         p.source_ref,
         p.sha256,
         p.summary,
         p.payload->>'title' AS title`,
      [limit, workerId]
    );
    await client.query('COMMIT');
    return result.rows;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function releaseClaims(rows, reason) {
  if (rows.length === 0) return;
  await pool.query(
    `UPDATE atlas_packets
     SET
       embedding_status = 'pending',
       embedding_claimed_at = NULL,
       embedding_claimed_by = NULL,
       embedding_timestamp = NOW()
     WHERE packet_id = ANY($1::uuid[])`,
    [rows.map((row) => row.packet_id)]
  );
  console.warn(`Released ${rows.length} claims: ${reason}`);
}

async function writeEmbeddingBatch(rows, vectors, workerId) {
  const client = await pool.connect();
  let success = 0;
  let failed = 0;

  try {
    await client.query('BEGIN');

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const vector = vectors[i];

      try {
        validateVector(vector, i);
        const content = buildEmbeddingText(row);
        const contentHash = row.sha256 || hashContent(content);
        const version = embeddingKey({ contentHash });

        const result = await client.query(
          `UPDATE atlas_packets
           SET
             embedding = $1::vector(768),
             embedding_status = 'success',
             embedding_version = $2,
             embedding_timestamp = NOW(),
             embedding_claimed_at = NULL,
             embedding_claimed_by = NULL,
             updated_at = NOW()
           WHERE packet_id = $3
             AND embedding IS NULL
             AND embedding_claimed_by = $4`,
          [vectorLiteral(vector), version, row.packet_id, workerId]
        );

        if (result.rowCount !== 1) {
          throw new Error(
            'canonical row was not updated; claim changed or embedding already exists'
          );
        }
        success++;
      } catch (error) {
        failed++;
        console.error(`Failed to write ${row.packet_key}: ${error.message}`);
        await client.query(
          `UPDATE atlas_packets
           SET
             embedding_status = 'failed',
             embedding_claimed_at = NULL,
             embedding_claimed_by = NULL,
             embedding_timestamp = NOW()
           WHERE packet_id = $1`,
          [row.packet_id]
        );
      }
    }

    await client.query('COMMIT');
    return { success, failed };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function processWorker(workerNumber, shared) {
  const workerId = `${options.workerId}-${workerNumber}`;

  while (true) {
    const remaining = options.maxPackets - shared.reserved;
    if (remaining <= 0) return;

    const requestSize = Math.min(options.batchSize, remaining);
    const dryRunOffset = shared.reserved;
    shared.reserved += requestSize;

    let rows;
    try {
      rows = options.dryRun
        ? await selectDryRunBatch(requestSize, dryRunOffset)
        : await claimPackets(requestSize, workerId);
    } catch (error) {
      shared.reserved -= requestSize;
      throw error;
    }

    if (rows.length < requestSize) {
      shared.reserved -= requestSize - rows.length;
    }
    if (rows.length === 0) return;

    const texts = rows.map(buildEmbeddingText);
    const emptyRows = rows.filter((_, index) => texts[index].length === 0);
    if (emptyRows.length > 0) {
      if (!options.dryRun) {
        await releaseClaims(rows, 'batch contains packets without embeddable text');
      }
      throw new Error(`${emptyRows.length} packet(s) have no embeddable text`);
    }

    const started = Date.now();
    let vectors;
    try {
      vectors = await embedBatch(texts);
    } catch (error) {
      if (!options.dryRun) await releaseClaims(rows, error.message);
      shared.failed += rows.length;
      console.error(`[worker ${workerNumber}] embedding failed: ${error.message}`);
      continue;
    }

    if (options.dryRun) {
      shared.success += rows.length;
    } else {
      const written = await writeEmbeddingBatch(rows, vectors, workerId);
      shared.success += written.success;
      shared.failed += written.failed;
    }

    shared.processed += rows.length;
    const elapsedMs = Math.max(1, Date.now() - started);
    console.log(
      `[worker ${workerNumber}] ${rows.length} packets, ` +
        `${(rows.length / (elapsedMs / 1000)).toFixed(1)} pkt/s`
    );
  }
}

async function main() {
  console.log('\nParent Atlas canonical embedding backfill');
  console.log(`  representation: ${REPRESENTATION_NAME}`);
  console.log(`  schema:         ${REPRESENTATION_SCHEMA}`);
  console.log(`  model:          ${MODEL}`);
  console.log(`  revision:       ${MODEL_REVISION}`);
  console.log(`  dimension:      ${EMBEDDING_DIM}`);
  console.log(
    `  mode:           ${options.verifyOnly ? 'VERIFY' : options.dryRun ? 'DRY-RUN' : 'APPLY'}`
  );
  console.log(`  database:       127.0.0.1:5434 host proxy (unless DATABASE_URL overrides)`);

  try {
    const runtime = await verifySchemaAndRuntime();
    console.log(`  postgres type:  ${runtime.declaredType}`);
    console.log(`  runtime dim:    ${runtime.runtimeDimension}`);

    const before = await readCoverage();
    console.log('\nCoverage before:');
    console.log(JSON.stringify(before, null, 2));

    if (options.verifyOnly) return;

    const shared = {
      reserved: 0,
      processed: 0,
      success: 0,
      failed: 0,
    };
    const start = Date.now();

    await Promise.all(
      Array.from({ length: options.concurrency }, (_, index) => processWorker(index + 1, shared))
    );

    const after = await readCoverage();
    const durationSeconds = Math.max(0.001, (Date.now() - start) / 1000);

    console.log('\nBackfill summary:');
    console.log(
      JSON.stringify(
        {
          representation_name: REPRESENTATION_NAME,
          representation_schema: REPRESENTATION_SCHEMA,
          model: MODEL,
          model_revision: MODEL_REVISION,
          dimension: EMBEDDING_DIM,
          mode: options.dryRun ? 'dry-run' : 'apply',
          processed: shared.processed,
          success: shared.success,
          failed: shared.failed,
          duration_seconds: Number(durationSeconds.toFixed(3)),
          throughput_packets_per_second: Number((shared.processed / durationSeconds).toFixed(2)),
          coverage_before: before,
          coverage_after: after,
          downstream_projection_contract: {
            postgres: 'canonical truth',
            qdrant: 'mirror semantic_768 only after Postgres success',
            neo4j: 'typed ontology/graph projection; no vector ownership',
            som_latent64: 'derived routing projection; never canonical semantic truth',
          },
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('FATAL:', error.stack || error.message);
  process.exitCode = 1;
});

