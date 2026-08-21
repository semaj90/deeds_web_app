#!/usr/bin/env node
/**
 * Lane B Recovery: Qdrant 768 v2 Clean Collection Backfill
 *
 * Rebuilds from Postgres using UUID-based Qdrant IDs (avoids integer allocation).
 * Uses keyset pagination, halfvec parsing, validates all 52,380 vectors.
 * No checkpointing (single-run, non-resumable for safety—if interrupted, restart from zero).
 *
 * Usage:
 *   node scripts/atlas/backfill-qdrant-768-v2-uuid.mjs --dry-run --limit 100
 *   node scripts/atlas/backfill-qdrant-768-v2-uuid.mjs --apply --batch-size 256
 */

import { Pool } from 'pg';
import fetch from 'node-fetch';
import { loadAtlasEnv } from './load-atlas-env.mjs';

await loadAtlasEnv();

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const BATCH_SIZE = 256;
const LIMIT = 52380;
const CANONICAL_DIMENSION = 768;

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const QDRANT_COLLECTION = 'codebase_chunks_768_v2';
const QDRANT_VECTOR_NAME = 'content';

const PG_URL = process.env.DATABASE_URL;
const QDRANT_URL = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/^0\.0\.0\.0/, '127.0.0.1');

if (!PG_URL) {
  console.error('[FAIL] DATABASE_URL not set');
  process.exit(1);
}

console.log(`🔄 Lane B Recovery: Qdrant 768 v2 Clean Backfill (UUID-based IDs)`);
console.log(`   Collection: ${QDRANT_COLLECTION}`);
console.log(`   Vector: ${QDRANT_VECTOR_NAME}`);
console.log(`   Batch size: ${BATCH_SIZE}`);
console.log(`   Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
console.log('');

const pool = new Pool({ connectionString: PG_URL });

function parseHalfvec(text) {
  if (typeof text !== 'string') {
    throw new TypeError(`embedding must be a string, got ${typeof text}`);
  }
  const body = text.trim();
  if (!body.startsWith('[') || !body.endsWith(']')) {
    throw new Error(`invalid halfvec format: ${body.substring(0, 50)}`);
  }
  const arr = JSON.parse(body);
  if (!Array.isArray(arr)) throw new Error('parsed halfvec is not an array');
  if (arr.length !== CANONICAL_DIMENSION) {
    throw new Error(`dimension mismatch: expected ${CANONICAL_DIMENSION}, got ${arr.length}`);
  }
  for (let i = 0; i < arr.length; i++) {
    if (!Number.isFinite(arr[i])) throw new Error(`non-finite value at index ${i}: ${arr[i]}`);
  }
  return arr;
}

/**
 * Projection metadata is part of the durable Qdrant payload contract.
 * Never stringify SQL NULL into identifiers such as `card:<path>:null`.
 */
function validateProjectionMetadata(row) {
  if (typeof row.relative_path !== 'string' || row.relative_path.trim().length === 0) {
    throw new Error('SOURCE_REF_REQUIRED');
  }
  if (typeof row.content_hash !== 'string' || row.content_hash.trim().length === 0) {
    throw new Error('CONTENT_HASH_REQUIRED');
  }
  if (typeof row.chunk_id !== 'string' || row.chunk_id.trim().length === 0) {
    throw new Error('CHUNK_ID_REQUIRED');
  }
}

let scannedRows = 0;
let insertedRows = 0;
let skippedRows = 0;
const rejectionCounts = {};

const startTime = Date.now();
let currentCursor = ZERO_UUID;

try {
  while (scannedRows < LIMIT) {
    const batchLimit = Math.min(BATCH_SIZE, LIMIT - scannedRows);

    const query = `
      SELECT
        id,
        relative_path,
        chunk_id,
        content_hash,
        content_embedding::text AS embedding_text,
        embedding_model,
        updated_at
      FROM codebase_chunk_index
      WHERE content_embedding IS NOT NULL
        AND id > $1
      ORDER BY id
      LIMIT $2
    `;

    let rows;
    try {
      const result = await pool.query(query, [currentCursor, batchLimit]);
      rows = result.rows;
    } catch (err) {
      console.error(`❌ FATAL: Postgres query failed: ${err.message}`);
      process.exit(1);
    }

    if (rows.length === 0) {
      console.log(`✅ Backfill complete: no more rows beyond cursor ${currentCursor}`);
      break;
    }

    const points = [];
    let batchErrors = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      let embedding;

      try {
        validateProjectionMetadata(row);
        embedding = parseHalfvec(row.embedding_text);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`   Row ${row.id}: Projection rejected: ${reason}`);
        rejectionCounts[reason] = (rejectionCounts[reason] ?? 0) + 1;
        batchErrors++;
        skippedRows++;
        continue;
      }

      // Actual Qdrant ID is the canonical Postgres UUID. qdrant_point_id is payload metadata only.
      const qdrantPointId = `card:${row.relative_path}:${row.content_hash}`;
      points.push({
        id: row.id,
        vector: { [QDRANT_VECTOR_NAME]: embedding },
        payload: {
          postgres_id: row.id,
          chunk_id: row.chunk_id,
          source_ref: row.relative_path,
          content_hash: row.content_hash,
          representation_name: 'semantic_768',
          representation_id: null,
          embedding_model: row.embedding_model,
          model_revision: null,
          model_revision_state: 'NOT_PROVEN',
          qdrant_point_id: qdrantPointId,
          projection_revision: 'v2_uuid_clean',
          indexed_at: new Date().toISOString()
        }
      });
    }

    scannedRows += rows.length;
    // Advance cursor even when all rows are rejected so a malformed row cannot stall the scan forever.
    currentCursor = rows[rows.length - 1].id;

    if (points.length === 0) {
      console.warn(`⚠️ Batch produced no writable points (${batchErrors} rejected); continuing after cursor ${currentCursor}`);
      continue;
    }

    if (DRY_RUN) {
      insertedRows += points.length;
    } else {
      try {
        const response = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points?wait=true`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points }),
          timeout: 30000
        });

        if (!response.ok) {
          const body = await response.text();
          console.error(`❌ Qdrant upsert failed: HTTP ${response.status}: ${body.slice(0, 200)}`);
          break;
        }
        insertedRows += points.length;
      } catch (err) {
        console.error(`❌ Qdrant upsert network error: ${err.message}`);
        break;
      }
    }

    const elapsedSec = (Date.now() - startTime) / 1000;
    const rate = insertedRows > 0 ? (insertedRows / elapsedSec).toFixed(1) : '0';
    console.log(`   [${scannedRows}/${LIMIT}] Inserted: ${insertedRows}, Skipped: ${skippedRows}, Rate: ${rate} pts/sec`);
  }

  const elapsedMin = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log('');
  console.log('✅ Backfill v2 Summary:');
  console.log(`   Scanned: ${scannedRows}`);
  console.log(`   Inserted: ${insertedRows}`);
  console.log(`   Skipped: ${skippedRows}`);
  console.log(`   Rejections: ${JSON.stringify(rejectionCounts)}`);
  console.log(`   Duration: ${elapsedMin}m`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`   Collection: ${QDRANT_COLLECTION}`);
} finally {
  await pool.end();
}

process.exit(0);
