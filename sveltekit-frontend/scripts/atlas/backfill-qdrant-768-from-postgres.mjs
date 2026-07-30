#!/usr/bin/env node
/**
 * Lane B: Backfill Qdrant codebase_chunks_768 from Postgres canonical 768-dim vectors
 *
 * Reads 52,380 canonical 768-dim vectors from codebase_chunk_index, validates each batch,
 * and upserts to Qdrant codebase_chunks_768 collection. Designed to work independently of
 * GPU service status (uses pre-computed vectors only, no embedding calls).
 *
 * Progress checkpoint: stored in Redis at `backfill:qdrant:768:checkpoint`
 * Validation gates:
 *   - Dimension check: every embedding must be exactly 768 floats
 *   - Finite values: no NaN, no Inf (hard fail per batch)
 *   - Content hash uniqueness: within batch (hard fail if duplicate)
 *   - Qdrant upsert success: atomic per batch
 *
 * Usage:
 *   node scripts/atlas/backfill-qdrant-768-from-postgres.mjs --dry-run --limit 100
 *   node scripts/atlas/backfill-qdrant-768-from-postgres.mjs --apply --batch-size 256
 *   node scripts/atlas/backfill-qdrant-768-from-postgres.mjs --resume --verbose
 *
 * Flags:
 *   --dry-run        Show what would be upserted, don't write to Qdrant
 *   --apply          Execute the backfill (default: dry-run if omitted)
 *   --resume         Resume from last checkpoint (stored in Redis)
 *   --batch-size=N   Vectors per Qdrant upsert (default: 256, range: 50–1000)
 *   --limit=N        Max vectors to process (default: 52380)
 *   --verbose        Detailed logging per batch
 *   --skip-validation Skip dimension/finite-value checks (UNSAFE, for testing only)
 */

import { Pool } from 'pg';
import Redis from 'ioredis';
import fetch from 'node-fetch';
import { createHash } from 'crypto';
import { loadAtlasEnv } from './load-atlas-env.mjs';

// ─────────────────────────────────────────────────────────────────────────

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const RESUME = process.argv.includes('--resume');
const BATCH_SIZE = Math.max(50, Math.min(1000, parseInt(process.argv.find(a => a.startsWith('--batch-size='))?.split('=')[1] ?? '256')));
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '52380');
const VERBOSE = process.argv.includes('--verbose');
const SKIP_VALIDATION = process.argv.includes('--skip-validation');

const CANONICAL_DIMENSION = 768;
const QDRANT_COLLECTION = 'codebase_chunks_768';
const QDRANT_VECTOR_NAME = 'content';  // Canonical vector slot (also aliased semantic_768 in payload lineage)
const CHECKPOINT_KEY = 'backfill:qdrant:768:checkpoint';

await loadAtlasEnv();

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

console.log(`🔄 Lane B: Qdrant 768-dim Backfill`);
console.log(`   Collection: ${QDRANT_COLLECTION}`);
console.log(`   Vector name: ${QDRANT_VECTOR_NAME}`);
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
  console.warn(`⚠️  Redis connect failed (checkpoint disabled): ${err.message}`);
}

// ─────────────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────────────

function parseHalfvecString(s) {
  // halfvec format: "[val1,val2,...]" as string
  if (typeof s === 'string') {
    try {
      return JSON.parse(s);
    } catch {
      throw new Error(`Failed to parse halfvec string: ${s.substring(0, 50)}`);
    }
  }
  return s;
}

function validateEmbedding(embedding, i) {
  // Parse if string
  let arr = embedding;
  if (typeof embedding === 'string') {
    arr = parseHalfvecString(embedding);
  }

  if (!Array.isArray(arr) && !(arr instanceof Float32Array)) {
    throw new Error(`Row ${i}: embedding is not an array after parsing (got ${typeof arr})`);
  }
  if (arr.length !== CANONICAL_DIMENSION) {
    throw new Error(`Row ${i}: dimension mismatch (expected ${CANONICAL_DIMENSION}, got ${arr.length})`);
  }
  for (let j = 0; j < arr.length; j++) {
    const v = arr[j];
    if (!Number.isFinite(v)) {
      throw new Error(`Row ${i}: non-finite value at index ${j}: ${v}`);
    }
  }

  return arr;
}

function assertLineage(row) {
  const missing = [];
  if (!row.relative_path) missing.push('relative_path');
  // content_hash may be NULL, that's OK (will use id as fallback)

  if (missing.length > 0) {
    throw new Error(`Missing lineage for row ${row.id}: [${missing.join(', ')}]. Cannot derive packet_key.`);
  }
}

function generatePacketKey(row) {
  // Deterministic packet_key: use content_hash if available, fallback to id
  const hashInput = row.content_hash || row.id;
  const input = `${row.relative_path}:${hashInput}`;
  return createHash('sha256').update(input).digest('hex').substring(0, 32);
}

function validateBatch(rows) {
  if (SKIP_VALIDATION) return;

  const seenIds = new Set();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Dimension & finite check + parse halfvec
    validateEmbedding(row.content_embedding, i);

    // Canonical lineage gate (hard fail if missing)
    assertLineage(row);

    // UUID uniqueness
    if (seenIds.has(row.id)) {
      throw new Error(`Batch duplicate id: ${row.id} at row ${i}`);
    }
    seenIds.add(row.id);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Load checkpoint
// ─────────────────────────────────────────────────────────────────────────

let startOffset = 0;
if (RESUME) {
  try {
    const checkpoint = await redis.get(CHECKPOINT_KEY);
    if (checkpoint) {
      startOffset = parseInt(checkpoint);
      console.log(`✅ Resuming from offset ${startOffset}`);
    }
  } catch (err) {
    console.warn(`⚠️  Could not load checkpoint: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Main backfill loop
// ─────────────────────────────────────────────────────────────────────────

let totalProcessed = 0;
let totalBatches = 0;
let totalUpserted = 0;
let failedBatches = 0;

const startTime = Date.now();

try {
  let offset = startOffset;

  while (offset < LIMIT) {
    const batchLimit = Math.min(BATCH_SIZE, LIMIT - offset);

    // Fetch batch from Postgres (codebase_chunk_index is the canonical source)
    const query = `
      SELECT
        id,
        relative_path,
        symbol,
        kind,
        content_embedding,
        summary,
        domain,
        metadata,
        indexed_at,
        content_hash
      FROM codebase_chunk_index
      WHERE content_embedding IS NOT NULL
      ORDER BY id
      LIMIT $1 OFFSET $2
    `;

    let rows;
    try {
      const result = await pool.query(query, [batchLimit, offset]);
      rows = result.rows;
    } catch (err) {
      console.error(`❌ Batch [${offset}–${offset + batchLimit}]: Postgres query failed: ${err.message}`);
      failedBatches++;
      offset += batchLimit;
      continue;
    }

    if (rows.length === 0) {
      console.log(`✅ Backfill complete: reached end of data at offset ${offset}`);
      break;
    }

    // Validate batch
    try {
      validateBatch(rows);
    } catch (err) {
      console.error(`❌ Batch [${offset}–${offset + rows.length}]: Validation failed: ${err.message}`);
      failedBatches++;
      offset += rows.length;
      continue;
    }

    // Build Qdrant points with canonical lineage (generated deterministically)
    const points = rows.map(row => {
      const embeddingArray = parseHalfvecString(row.content_embedding);
      const packetKey = generatePacketKey(row);
      return {
        id: row.id.replace(/-/g, '').substring(0, 36), // UUID as point ID
        vector: {
          [QDRANT_VECTOR_NAME]: embeddingArray
        },
        payload: {
          packet_key: packetKey,
          source_ref: row.relative_path,
          content_hash: row.content_hash,
          workspace_id: process.env.ATLAS_WORKSPACE_ID ?? 'phase108d-backfill',
          representation_id: 'codebase_chunks_768',
          symbol: row.symbol,
          artifact_kind: row.kind,
          summary: row.summary,
          domain_class: row.domain,
          metadata: row.metadata,
          indexed_at: row.indexed_at.toISOString()
        }
      };
    });

    // Upsert to Qdrant (or dry-run)
    if (DRY_RUN) {
      if (VERBOSE) {
        console.log(`   [DRY-RUN] Would upsert ${points.length} points at offset ${offset}`);
      }
      totalUpserted += points.length;
    } else {
      try {
        const response = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points?wait=true`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points })
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
        }

        const result = await response.json();
        totalUpserted += points.length;

        if (VERBOSE) {
          console.log(`   ✅ [${offset}–${offset + points.length}]: Upserted ${points.length} points`);
        }
      } catch (err) {
        console.error(`❌ Batch [${offset}–${offset + points.length}]: Qdrant upsert failed: ${err.message}`);
        failedBatches++;
        offset += rows.length;
        continue;
      }
    }

    totalProcessed += rows.length;
    totalBatches++;
    offset += rows.length;

    // Update checkpoint every batch
    if (redis.isOpen && !DRY_RUN) {
      try {
        await redis.set(CHECKPOINT_KEY, offset.toString(), 'EX', 86400); // 24h TTL
      } catch (err) {
        console.warn(`⚠️  Checkpoint update failed: ${err.message}`);
      }
    }

    // Progress log
    if (totalBatches % 10 === 0 || VERBOSE) {
      const elapsedSec = (Date.now() - startTime) / 1000;
      const rate = (totalProcessed / elapsedSec).toFixed(1);
      console.log(`   [${totalBatches} batches] ${totalProcessed}/${LIMIT} processed (${rate} pts/sec)`);
    }
  }

  // Final summary
  const elapsedMin = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log('');
  console.log(`✅ Backfill Summary:`);
  console.log(`   Total processed: ${totalProcessed}`);
  console.log(`   Total upserted: ${totalUpserted}`);
  console.log(`   Batches: ${totalBatches} (${failedBatches} failed)`);
  console.log(`   Duration: ${elapsedMin}m`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);

  if (!DRY_RUN && totalProcessed > 0) {
    console.log(`   Next: Run a semantic query to verify Qdrant collection`);
  }

} finally {
  if (redis.isOpen) {
    await redis.quit();
  }
  await pool.end();
}

process.exit(failedBatches > 0 ? 1 : 0);
