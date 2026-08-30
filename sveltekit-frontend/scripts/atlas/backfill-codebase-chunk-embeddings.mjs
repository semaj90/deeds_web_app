#!/usr/bin/env node
/**
 * Full-Corpus Embedding Backfill for codebase_chunk_index
 *
 * Backfills content_embedding_768 (768-dim, embeddinggemma:latest) for all codebase chunks
 * where content_embedding_768 IS NULL. The generic content_embedding column is legacy
 * compatibility storage and is not the canonical semantic_768 writer target.
 *
 * Pipeline:
 *   1. Fetch chunks from Postgres (batch-friendly select)
 *   2. Batch into groups of 32-64 per request (optimal for RTX 3060 Ti)
 *   3. Call EmbeddingGemma via HTTP fallback (/api/embed)
 *   4. Stream results back and UPDATE codebase_chunk_index atomically
 *   5. Log progress every 100 chunks + handle failures gracefully
 *   6. Produce summary: total_chunks, successful, failed, duration_minutes
 *
 * Usage:
 *   node scripts/atlas/backfill-codebase-chunk-embeddings.mjs --dry-run --limit=100
 *   node scripts/atlas/backfill-codebase-chunk-embeddings.mjs --apply --batch-size=64
 *
 * Flags:
 *   --dry-run        Show what would be embedded, don't write
 *   --apply          Execute the backfill (also requires
 *                    ATLAS_AUTHORIZE_SEMANTIC_768_BACKFILL=1)
 *   --batch-size=N   Embeddings per gRPC/HTTP request (default: 48)
 *   --limit=N        Max eligible chunks to process (default: all current eligible rows)
 *   --checkpoint=N   Progress log interval (default: 100)
 *   --timeout=N      gRPC/HTTP timeout in ms (default: 30000)
 *   --verbose        Detailed logging
 */

import { Pool } from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';

// ── Configuration ──────────────────────────────────────────────────────────

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const BATCH_SIZE = parseInt(process.argv.find(a => a.startsWith('--batch-size='))?.split('=')[1] ?? '48');
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '0');
const CHECKPOINT_INTERVAL = parseInt(process.argv.find(a => a.startsWith('--checkpoint='))?.split('=')[1] ?? '100');
const TIMEOUT_MS = parseInt(process.argv.find(a => a.startsWith('--timeout='))?.split('=')[1] ?? '30000');
const VERBOSE = process.argv.includes('--verbose');

await loadAtlasEnv();

const PG_URL = process.env.DATABASE_URL;
const OLLAMA_URL = (process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/^0\.0\.0\.0/, '127.0.0.1');
const EMBEDDING_MODEL = process.env.EMBEDDINGGEMMA_MODEL ?? process.env.EMBEDDING_GEMMA_MODEL ?? 'embeddinggemma:latest';

if (!PG_URL) {
  console.error('[FAIL] DATABASE_URL not set');
  process.exit(1);
}

// ── Postgres Connection Pool (ioredis style: lazyConnect, maxRetries 1) ────

const pool = new Pool({
  connectionString: PG_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 60_000,
});

pool.on('error', (err) => {
  console.error('[POOL ERROR]', err.message);
});

// ── Statistics ─────────────────────────────────────────────────────────────

let stats = {
  totalChunks: 0,
  chunksFetched: 0,
  chunksEmbedded: 0,
  chunksFailed: 0,
  batchesProcessed: 0,
  startTime: Date.now(),
  lastProgressTime: Date.now(),
};

// ── Utility Functions ──────────────────────────────────────────────────────

/**
 * Log with timestamp + optional verbose control
 */
function log(level, message) {
  const timestamp = new Date().toISOString();
  if (level === 'VERBOSE' && !VERBOSE) return;
  console.log(`[${timestamp}] [${level}] ${message}`);
}

/**
 * Format duration (ms) → human-readable
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

/**
 * Fetch chunks needing embeddings from Postgres.
 * Uses keyset pagination so row churn during the run cannot re-surface
 * already processed chunks the way OFFSET paging can.
 */
async function fetchChunksNeedingEmbeddings(afterId = null, limit = 0) {
  const client = await pool.connect();
  try {
    const limitClause = limit > 0 ? `LIMIT ${limit}` : '';
    const cursorClause = afterId ? 'AND id > $1' : '';
    const res = await client.query(`
      SELECT
        id,
        relative_path AS file_path,
        content,
        line_start,
        line_end,
        token_count,
        content_hash
      FROM codebase_chunk_index
      WHERE content_embedding_768 IS NULL
        AND content IS NOT NULL
        AND LENGTH(TRIM(content)) > 0
        ${cursorClause}
      ORDER BY id ASC
      ${limitClause}
    `, afterId ? [afterId] : []);
    return res.rows;
  } finally {
    client.release();
  }
}

/**
 * Embed texts via the EmbeddingGemma batch endpoint
 * Returns array of 768-dim embeddings (nullable on failure per-item)
 */
async function embedBatch(texts) {
  const startTime = performance.now();
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: texts,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => 'unknown error');
      throw new Error(`HTTP ${res.status}: ${detail.slice(0, 100)}`);
    }

    const data = await res.json();
    const embeddings = data.embeddings ?? [];

    if (!Array.isArray(embeddings)) {
      throw new Error('Response missing embeddings array');
    }

    if (embeddings.length !== texts.length) {
      throw new Error(`Embedding count mismatch: got ${embeddings.length}, expected ${texts.length}`);
    }

    const durationMs = Math.round(performance.now() - startTime);
    log('VERBOSE', `Embedded ${texts.length} chunks in ${formatDuration(durationMs)}`);

    return {
      success: true,
      embeddings: embeddings.map((e) => (Array.isArray(e) ? new Float32Array(e) : null)),
      durationMs,
    };
  } catch (err) {
    const durationMs = Math.round(performance.now() - startTime);
    log('WARN', `Embedding batch failed: ${err.message} (${formatDuration(durationMs)})`);
    return {
      success: false,
      embeddings: texts.map(() => null),
      error: err.message,
      durationMs,
    };
  }
}

/**
 * Validate embedding dimension (768-dim expected)
 */
function isValidEmbedding(embedding) {
  if (!embedding || embedding.length !== 768) return false;
  let normSquared = 0;
  for (const value of embedding) {
    if (!Number.isFinite(value)) return false;
    normSquared += value * value;
  }
  return Number.isFinite(normSquared) && normSquared >= 0.98 && normSquared <= 1.02;
}

/**
 * Update Postgres with embeddings
 * Atomic transaction: all-or-nothing per batch
 */
async function updateChunksWithEmbeddings(updates) {
  if (updates.length === 0) return { success: true, count: 0 };

  const client = await pool.connect();
  try {
    const ids = [];
    const vectorLiterals = [];

    for (const { id, embedding } of updates) {
      if (!isValidEmbedding(embedding)) {
        throw new Error(`Invalid embedding for chunk ${id}: dim=${embedding?.length ?? 0}`);
      }

      ids.push(id);
      vectorLiterals.push(`[${Array.from(embedding).join(',')}]`);
    }

    await client.query('BEGIN');

    // One typed batch update avoids one PostgreSQL round trip per embedding.
    // The explicit cast preserves pgvector's vector(768) dimension check.
    const result = await client.query(
      `UPDATE codebase_chunk_index AS c
       SET content_embedding_768 = u.embedding::vector(768),
           embedding_model = $3,
           embedding_version = 'semantic_768:' || $3,
           embedding_dimension = 768,
           embedding_normalized = true,
           embedding_created_at = COALESCE(embedding_created_at, now()),
           updated_at = now()
       FROM unnest($1::uuid[], $2::text[]) AS u(id, embedding)
       WHERE c.id = u.id
         AND c.content_embedding_768 IS NULL`,
      [ids, vectorLiterals, EMBEDDING_MODEL]
    );

    if (result.rowCount !== updates.length) {
      throw new Error(`Batch update count mismatch: updated ${result.rowCount}, expected ${updates.length}`);
    }

    await client.query('COMMIT');
    return { success: true, count: updates.length };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    log('ERROR', `Postgres transaction failed: ${err.message}`);
    return { success: false, error: err.message, count: 0 };
  } finally {
    client.release();
  }
}

/**
 * Count total chunks needing embeddings
 */
async function getEmbeddingCoverage() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN content_embedding_768 IS NOT NULL AND embedding_dimension = 768 THEN 1 END) as populated,
        COUNT(CASE WHEN content_embedding_768 IS NULL THEN 1 END) as missing,
        COUNT(CASE WHEN content_embedding_768 IS NOT NULL AND embedding_dimension <> 768 THEN 1 END) as contaminated
      FROM codebase_chunk_index
      WHERE content IS NOT NULL
        AND LENGTH(TRIM(content)) > 0
    `);
    const row = res.rows[0] || { total: 0, populated: 0 };
    return {
      total: parseInt(row.total, 10),
      populated: parseInt(row.populated, 10),
      missing: parseInt(row.missing, 10),
      contaminated: parseInt(row.contaminated, 10),
      coveragePct: row.total > 0 ? ((parseInt(row.populated, 10) / parseInt(row.total, 10)) * 100).toFixed(2) : '0.00',
    };
  } finally {
    client.release();
  }
}

/**
 * Process chunks in batches
 */
async function backfillEmbeddings() {
  log('INFO', `Starting backfill: batch_size=${BATCH_SIZE}, limit=${LIMIT || 'all'}, dry_run=${DRY_RUN}`);

  // Pre-flight: coverage check
  const coverage = await getEmbeddingCoverage();
  log('INFO', `Current coverage: ${coverage.populated}/${coverage.total} (${coverage.coveragePct}%) — ${coverage.missing} missing`);

  stats.totalChunks = coverage.missing;

  if (coverage.missing === 0) {
    log('INFO', 'No chunks needing embeddings — already complete');
    return stats;
  }

  let lastId = null;
  const maxChunks = LIMIT > 0 ? LIMIT : coverage.missing;

  while (stats.chunksFetched < maxChunks) {
    // Fetch batch from Postgres
    const chunks = await fetchChunksNeedingEmbeddings(lastId, BATCH_SIZE);
    if (chunks.length === 0) break;

    log('VERBOSE', `Fetched batch: ${chunks.length} chunks (after ${lastId ?? 'start'})`);
    stats.chunksFetched += chunks.length;

    // Extract content for embedding
    const texts = chunks.map((c) => c.content);

    // Embed via HTTP
    const embeddingResult = await embedBatch(texts);

    // Prepare updates (filter out failed embeddings)
    const updates = [];
    let batchFailures = 0;
    for (let i = 0; i < chunks.length; i++) {
      const embedding = embeddingResult.embeddings[i];
      if (isValidEmbedding(embedding)) {
        updates.push({
          id: chunks[i].id,
          embedding,
        });
        stats.chunksEmbedded++;
      } else {
        batchFailures++;
        stats.chunksFailed++;
      }
    }

    // Write to Postgres (if not dry-run)
    if (!DRY_RUN && updates.length > 0) {
      const pgResult = await updateChunksWithEmbeddings(updates);
      if (!pgResult.success) {
        log('ERROR', `Failed to update ${updates.length} chunks: ${pgResult.error}`);
        stats.chunksFailed += updates.length;
        stats.chunksEmbedded -= updates.length;
      }
    }

    stats.batchesProcessed++;

    // Progress logging
    if (stats.chunksFetched % CHECKPOINT_INTERVAL === 0 || stats.chunksFetched >= maxChunks) {
      const elapsedMs = Date.now() - stats.startTime;
      const rate = stats.chunksFetched / (elapsedMs / 1000);
      const remaining = maxChunks - stats.chunksFetched;
      const etaMs = remaining > 0 ? (remaining / rate) * 1000 : 0;

      log('INFO', `Progress: ${stats.chunksFetched}/${maxChunks} chunks (${((stats.chunksFetched / maxChunks) * 100).toFixed(1)}%) — ` +
        `${rate.toFixed(1)} chunks/sec — ETA ${formatDuration(etaMs)} — ` +
        `succeeded=${stats.chunksEmbedded}, failed=${stats.chunksFailed}, batches=${stats.batchesProcessed}`);
    }

    lastId = chunks[chunks.length - 1]?.id ?? lastId;
    if (stats.chunksFetched >= maxChunks) break;
  }

  return stats;
}

// ── Main Execution ────────────────────────────────────────────────────────

async function main() {
  try {
    log('INFO', `Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);

    if (APPLY && process.env.ATLAS_AUTHORIZE_SEMANTIC_768_BACKFILL !== '1') {
      throw new Error('EXPLICIT_SEMANTIC_768_BACKFILL_AUTHORIZATION_REQUIRED');
    }

    if (DRY_RUN) {
      log('INFO', 'Performing dry-run (no database writes)');
    }

    const finalStats = await backfillEmbeddings();

    // Final report
    const totalDurationMs = Date.now() - finalStats.startTime;
    const totalDurationMin = (totalDurationMs / 60_000).toFixed(2);
    const successRate = finalStats.chunksFetched > 0 ?
      ((finalStats.chunksEmbedded / finalStats.chunksFetched) * 100).toFixed(1) :
      '0.0';

    log('INFO', '');
    log('INFO', '╔════════════════════════════════════════╗');
    log('INFO', '║ BACKFILL COMPLETE                      ║');
    log('INFO', '╚════════════════════════════════════════╝');
    log('INFO', `Total chunks:     ${finalStats.totalChunks}`);
    log('INFO', `Fetched:          ${finalStats.chunksFetched}`);
    log('INFO', `Successfully embedded: ${finalStats.chunksEmbedded}`);
    log('INFO', `Failed:           ${finalStats.chunksFailed}`);
    log('INFO', `Success rate:     ${successRate}%`);
    log('INFO', `Batches:          ${finalStats.batchesProcessed}`);
    log('INFO', `Duration:         ${totalDurationMin} minutes`);
    log('INFO', '');

    // Verify final coverage
    const finalCoverage = await getEmbeddingCoverage();
    log('INFO', `Final coverage: ${finalCoverage.populated}/${finalCoverage.total} (${finalCoverage.coveragePct}%)`);

    if (!DRY_RUN && finalStats.chunksEmbedded > 0) {
      log('INFO', '✓ Backfill complete — embeddings persisted to Postgres');
    } else if (DRY_RUN) {
      log('INFO', '✓ Dry-run complete — no changes written');
    }

    await pool.end();
    process.exit(finalStats.chunksFailed > 0 && finalStats.chunksEmbedded === 0 ? 1 : 0);
  } catch (err) {
    log('ERROR', `Fatal error: ${err.message}`);
    console.error(err);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

main();
