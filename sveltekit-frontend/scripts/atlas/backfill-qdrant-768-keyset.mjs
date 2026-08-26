#!/usr/bin/env node
/**
 * Lane B: Qdrant 768-dim Backfill with Keyset Pagination & Postgres Checkpointing
 *
 * Backfills Qdrant codebase_chunks_768 collection from Postgres codebase_chunk_index.
 * Uses keyset (cursor-based) pagination for safety at 52K scale.
 * Preserves existing 1,001 integer point IDs; continues sequence at ID 1002.
 * Uses `content` vector (not semantic_768).
 * Checkpoints to Postgres atlas_projection_checkpoints table.
 *
 * Usage:
 *   node scripts/atlas/backfill-qdrant-768-keyset.mjs --dry-run --limit 10
 *   node scripts/atlas/backfill-qdrant-768-keyset.mjs --apply --batch-size 256
 *   node scripts/atlas/backfill-qdrant-768-keyset.mjs --resume
 *
 * Flags:
 *   --dry-run        Show what would be upserted (default)
 *   --apply          Execute the backfill
 *   --resume         Resume from last checkpoint
 *   --batch-size=N   Vectors per Qdrant upsert (default: 256)
 *   --limit=N        Max vectors to process (default: 52380)
 *   --verbose        Detailed logging
 */

import { Pool } from 'pg';
import Redis from 'ioredis';
import fetch from 'node-fetch';
import crypto from 'crypto';
import { loadAtlasEnv } from './load-atlas-env.mjs';

await loadAtlasEnv();

// ─────────────────────────────────────────────────────────────────────────

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const RESUME = process.argv.includes('--resume');
const BATCH_SIZE = Math.max(50, Math.min(1000, parseInt(process.argv.find(a => a.startsWith('--batch-size='))?.split('=')[1] ?? '256')));
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '52380');
const VERBOSE = process.argv.includes('--verbose');

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const QDRANT_COLLECTION = 'codebase_chunks_768';
const QDRANT_VECTOR_NAME = 'content'; // Named vector in collection
const CANONICAL_DIMENSION = 768;

const PG_URL = process.env.DATABASE_URL;
const QDRANT_URL = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/^0\.0\.0\.0/, '127.0.0.1');
const REDIS_HOST = process.env.REDIS_HOST ?? '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT ?? '6379');
const REDIS_PASSWORD = process.env.REDIS_PASSWORD ?? 'redis';

if (!PG_URL) {
  console.error('[FAIL] DATABASE_URL not set');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────

console.log(`🔄 Lane B: Qdrant 768-dim Backfill (Keyset Pagination)`);
console.log(`   Collection: ${QDRANT_COLLECTION}`);
console.log(`   Vector: ${QDRANT_VECTOR_NAME}`);
console.log(`   Batch size: ${BATCH_SIZE}`);
console.log(`   Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
console.log(`   Resume: ${RESUME}`);
console.log('');

const pool = new Pool({ connectionString: PG_URL });
const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  lazyConnect: true,
  enableOfflineQueue: false,
  retryStrategy: () => null
});

try {
  await redis.connect();
} catch (err) {
  console.warn(`⚠️  Redis unavailable (checkpointing skipped): ${err.message}`);
}

// ─────────────────────────────────────────────────────────────────────────
// Parse halfvec text format: "[0.123,0.456,...]"
// ─────────────────────────────────────────────────────────────────────────

function parseHalfvec(text) {
  if (typeof text !== 'string') {
    throw new TypeError(`embedding must be a string, got ${typeof text}`);
  }
  const body = text.trim();
  if (!body.startsWith('[') || !body.endsWith(']')) {
    throw new Error(`invalid halfvec format: ${body.substring(0, 50)}`);
  }
  const arr = JSON.parse(body);
  if (!Array.isArray(arr)) {
    throw new Error(`parsed halfvec is not an array`);
  }
  if (arr.length !== CANONICAL_DIMENSION) {
    throw new Error(`dimension mismatch: expected ${CANONICAL_DIMENSION}, got ${arr.length}`);
  }
  for (let i = 0; i < arr.length; i++) {
    if (!Number.isFinite(arr[i])) {
      throw new Error(`non-finite value at index ${i}: ${arr[i]}`);
    }
  }
  return arr;
}

// ─────────────────────────────────────────────────────────────────────────
// Checkpoint management
// ─────────────────────────────────────────────────────────────────────────

async function loadCheckpoint() {
  try {
    const result = await pool.query(`
      SELECT last_source_id, scanned_rows, inserted_rows, updated_rows, skipped_rows
      FROM atlas_projection_checkpoints
      WHERE projection_name = 'qdrant_768_backfill'
        AND collection_name = $1
        AND status = 'RUNNING'
      ORDER BY updated_at DESC
      LIMIT 1
    `, [QDRANT_COLLECTION]);

    if (result.rows.length > 0) {
      const row = result.rows[0];
      console.log(`✅ Resumed from checkpoint:`);
      console.log(`   Last ID: ${row.last_source_id}`);
      console.log(`   Scanned: ${row.scanned_rows}, Inserted: ${row.inserted_rows}, Skipped: ${row.skipped_rows}`);
      return {
        lastId: row.last_source_id,
        scannedRows: row.scanned_rows,
        insertedRows: row.inserted_rows,
        updatedRows: row.updated_rows,
        skippedRows: row.skipped_rows
      };
    }
  } catch (err) {
    console.warn(`⚠️  Checkpoint load failed: ${err.message}`);
  }

  return {
    lastId: ZERO_UUID,
    scannedRows: 0,
    insertedRows: 0,
    updatedRows: 0,
    skippedRows: 0
  };
}

async function saveCheckpoint(lastId, stats) {
  if (!DRY_RUN && redis.isOpen) {
    try {
      await pool.query(`
        INSERT INTO atlas_projection_checkpoints
          (projection_name, collection_name, corpus_revision, run_id, last_source_id,
           scanned_rows, inserted_rows, updated_rows, skipped_rows, failed_rows, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (projection_name, collection_name, corpus_revision)
        DO UPDATE SET
          last_source_id = EXCLUDED.last_source_id,
          scanned_rows = EXCLUDED.scanned_rows,
          inserted_rows = EXCLUDED.inserted_rows,
          updated_rows = EXCLUDED.updated_rows,
          skipped_rows = EXCLUDED.skipped_rows,
          status = EXCLUDED.status,
          updated_at = now()
      `, [
        'qdrant_768_backfill',
        QDRANT_COLLECTION,
        '2026-07-29',
        crypto.randomUUID(),
        lastId,
        stats.scannedRows,
        stats.insertedRows,
        stats.updatedRows,
        stats.skippedRows,
        0,
        'RUNNING'
      ]);
    } catch (err) {
      console.warn(`⚠️  Checkpoint save failed: ${err.message}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Main backfill loop
// ─────────────────────────────────────────────────────────────────────────

let checkpoint = RESUME ? await loadCheckpoint() : {
  lastId: ZERO_UUID,
  scannedRows: 0,
  insertedRows: 0,
  updatedRows: 0,
  skippedRows: 0
};

const startTime = Date.now();
let nextPointId = 1002; // Continue after existing 1,001 points
let currentCursor = checkpoint.lastId;

try {
  while (checkpoint.scannedRows < LIMIT) {
    const batchLimit = Math.min(BATCH_SIZE, LIMIT - checkpoint.scannedRows);

    // Fetch batch using keyset pagination
    const query = `
      SELECT
        id,
        qdrant_id,
        relative_path,
        symbol,
        kind,
        chunk_id,
        content_hash,
        content_embedding_768::text AS embedding_text,
        domain,
        updated_at
      FROM codebase_chunk_index
      WHERE content_embedding_768 IS NOT NULL
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

    // Validate and build points
    const points = [];
    let batchErrors = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      let embedding;

      try {
        embedding = parseHalfvec(row.embedding_text);
      } catch (err) {
        console.error(`   Row ${row.id}: Embedding parse failed: ${err.message}`);
        batchErrors++;
        checkpoint.skippedRows++;
        continue;
      }

      const qdrantPointId = `card:${row.relative_path}:${row.content_hash}`;
      points.push({
        id: nextPointId++,
        vector: {
          [QDRANT_VECTOR_NAME]: embedding
        },
        payload: {
          chunk_id: row.chunk_id,
          source_ref: row.relative_path,
          content_hash: row.content_hash,
          representation_id: 'semantic_768',
          dimension: CANONICAL_DIMENSION,
          model_revision: 'embeddinggemma:latest',
          representation_revision: 'semantic_768@v1',
          embedding_dimension: CANONICAL_DIMENSION,
          domain: row.domain,
          symbol: row.symbol,
          kind: row.kind,
          qdrant_point_id: qdrantPointId,
          postgres_id: row.id.toString(),
          postgres_updated_at: row.updated_at.toISOString()
        }
      });
    }

    if (points.length === 0) {
      console.error(`❌ Batch had no valid points (all ${batchErrors} skipped)`);
      break;
    }

    checkpoint.scannedRows += rows.length;

    // Upsert (or dry-run)
    if (DRY_RUN) {
      if (VERBOSE) {
        console.log(`   [DRY-RUN] Would upsert ${points.length} points (IDs ${points[0].id}–${points[points.length - 1].id})`);
      }
      checkpoint.insertedRows += points.length;
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

        checkpoint.insertedRows += points.length;

        if (VERBOSE) {
          console.log(`   ✅ Upserted ${points.length} points (IDs ${points[0].id}–${points[points.length - 1].id})`);
        }
      } catch (err) {
        console.error(`❌ Qdrant upsert network error: ${err.message}`);
        break;
      }
    }

    currentCursor = rows[rows.length - 1].id;
    await saveCheckpoint(currentCursor, checkpoint);

    const elapsedSec = (Date.now() - startTime) / 1000;
    const rate = checkpoint.insertedRows > 0 ? (checkpoint.insertedRows / elapsedSec).toFixed(1) : '0';
    console.log(`   [${checkpoint.scannedRows}/${LIMIT}] Inserted: ${checkpoint.insertedRows}, Skipped: ${checkpoint.skippedRows}, Rate: ${rate} pts/sec`);
  }

  // Final summary
  const elapsedMin = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log('');
  console.log(`✅ Backfill Summary:`);
  console.log(`   Scanned: ${checkpoint.scannedRows}`);
  console.log(`   Inserted: ${checkpoint.insertedRows}`);
  console.log(`   Skipped: ${checkpoint.skippedRows}`);
  console.log(`   Duration: ${elapsedMin}m`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`   Next Point ID: ${nextPointId}`);

  if (!DRY_RUN && checkpoint.insertedRows > 0) {
    console.log(`   ✅ Checkpointed. Resume with: --resume`);
  }

} finally {
  if (redis.isOpen) await redis.quit();
  await pool.end();
}

process.exit(0);
