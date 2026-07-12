#!/usr/bin/env node
/**
 * Full-Corpus Embedding Backfill for codebase_chunk_index
 *
 * Backfills content_embedding (384-dim, embeddinggemma:latest) for all 40,754 chunks
 * where content_embedding IS NULL.
 *
 * Pipeline:
 *   1. Fetch chunks from Postgres (batch-friendly select)
 *   2. Batch into groups of 32-64 per request (optimal for RTX 3060 Ti)
 *   3. Call EmbeddingGemma via HTTP fallback (Ollama /api/embed)
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
 *   --apply          Execute the backfill (default: dry-run if omitted)
 *   --batch-size=N   Embeddings per gRPC/HTTP request (default: 48)
 *   --limit=N        Max chunks to process (default: all 40,754)
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
const EMBEDDING_MODEL = 'embeddinggemma:latest';

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
 * Fetch chunks needing embeddings from Postgres
 * Selects chunks in deterministic order (id ASC) to avoid re-processing
 */
async function fetchChunksNeedingEmbeddings(offset = 0, limit = 0) {
  const client = await pool.connect();
  try {
    const limitClause = limit > 0 ? `LIMIT ${limit}` : '';
    const res = await client.query(`
      SELECT
        id,
        codebase_id,
        file_path,
        content,
        chunk_index,
        line_start,
        line_end,
        token_count,
        content_hash
      FROM codebase_chunk_index
      WHERE content_embedding IS NULL
        AND content IS NOT NULL
        AND LENGTH(TRIM(content)) > 0
      ORDER BY id ASC
      OFFSET ${offset}
      ${limitClause}
    `);
    return res.rows;
  } finally {
    client.release();
  }
}

/**
 * Embed texts via HTTP/Ollama batch endpoint
 * Returns array of 384-dim embeddings (nullable on failure per-item)
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
 * Validate embedding dimension (384-dim expected)
 */
function isValidEmbedding(embedding) {
  return embedding && embedding.length === 384;
}

/**
 * Update Postgres with embeddings
 * Atomic transaction: all-or-nothing per batch
 */
async function updateChunksWithEmbeddings(updates) {
  if (updates.length === 0) return { success: true, count: 0 };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const { id, embedding } of updates) {
      if (!isValidEmbedding(embedding)) {
        throw new Error(`Invalid embedding for chunk ${id}: dim=${embedding?.length ?? 0}`);
      }

      // Store embedding as vector type (pgvector)
      const embeddingArray = Array.from(embedding);
      await client.query(
        `UPDATE codebase_chunk_index
         SET content_embedding = $1, updated_at = now()
         WHERE id = $2`,
        [embeddingArray, id]
      );
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
        COUNT(CASE WHEN content_embedding IS NOT NULL THEN 1 END) as populated
      FROM codebase_chunk_index
      WHERE content IS NOT NULL
        AND LENGTH(TRIM(content)) > 0
    `);
    const row = res.rows[0] || { total: 0, populated: 0 };
    return {
      total: parseInt(row.total, 10),
      populated: parseInt(row.populated, 10),
      missing: parseInt(row.total, 10) - parseInt(row.populated, 10),
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

  let offset = 0;
  const maxChunks = LIMIT > 0 ? LIMIT : coverage.missing;

  while (stats.chunksFetched < maxChunks) {
    // Fetch batch from Postgres
    const chunks = await fetchChunksNeedingEmbeddings(offset, BATCH_SIZE);
    if (chunks.length === 0) break;

    log('VERBOSE', `Fetched batch: ${chunks.length} chunks (offset ${offset})`);
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

    offset += chunks.length;
    if (stats.chunksFetched >= maxChunks) break;
  }

  return stats;
}

// ── Main Execution ────────────────────────────────────────────────────────

async function main() {
  try {
    log('INFO', `Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);

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
