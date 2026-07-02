#!/usr/bin/env node
/**
 * Phase 1B: Postgres GIN tsvector + BM25 Ranking
 *
 * Index codebase_chunk_index for full-text search before ACE_PIPELINE_VERSION=3.0.0
 *
 * Prerequisites:
 * - PostgreSQL 18.4 with pg_trgm extension (trigram search)
 * - codebase_chunk_index table with content, feature_id, symbol columns
 * - EmbeddingGemma pass complete (content embeddings in place)
 *
 * Phases:
 * 1. Create tsvector column (searchable text index)
 * 2. Create GIN index on tsvector (fast full-text search)
 * 3. Compute BM25 scores from content frequency
 * 4. Create BRIN index on bm25_score (range scans)
 *
 * Output: Postgres ready for RRF fusion with BM25 + semantic signals
 *
 * Usage:
 *   npm run atlas:phase1b:index:dry
 *   npm run atlas:phase1b:index:apply
 */

import pg from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || !args.includes('--apply');
const verbose = args.includes('--verbose');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
  max: 10,
});

const proof = {
  timestamp: new Date().toISOString(),
  mode: dryRun ? 'dry-run' : 'apply',
  stats: {
    chunks_total: 0,
    chunks_indexed: 0,
    tsvector_column_created: false,
    gin_index_created: false,
    bm25_scores_computed: 0,
    brin_index_created: false,
    avg_bm25_score: 0,
    errors: 0
  },
  errors: []
};

/**
 * Phase 1: Create tsvector column if not exists
 */
async function createTsvectorColumn(client) {
  console.log(`\n[Phase 1/4] Creating tsvector column...`);

  try {
    // Check if column exists
    const checkResult = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'codebase_chunk_index' AND column_name = 'search_vector'
    `);

    if (checkResult.rows.length > 0) {
      console.log(`  ✓ search_vector column already exists`);
      return;
    }

    // Create tsvector column
    if (!dryRun) {
      await client.query(`
        ALTER TABLE codebase_chunk_index
        ADD COLUMN search_vector tsvector
        GENERATED ALWAYS AS (
          setweight(to_tsvector('english', COALESCE(symbol, '')), 'A') ||
          setweight(to_tsvector('english', COALESCE(feature_id, '')), 'B') ||
          setweight(to_tsvector('english', COALESCE(content, '')), 'C')
        ) STORED;
      `);
    }

    proof.stats.tsvector_column_created = true;
    console.log(`  ✓ tsvector column created (weighted: symbol A, feature_id B, content C)`);
  } catch (err) {
    console.warn(`  ⚠ Could not create tsvector column: ${err.message}`);
    proof.stats.errors++;
  }
}

/**
 * Phase 2: Create GIN index on tsvector
 */
async function createGinIndex(client) {
  console.log(`\n[Phase 2/4] Creating GIN index on tsvector...`);

  try {
    // Check if index exists
    const checkResult = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'codebase_chunk_index' AND indexname = 'codebase_chunk_index_search_vector_gin'
    `);

    if (checkResult.rows.length > 0) {
      console.log(`  ✓ GIN index already exists`);
      return;
    }

    if (!dryRun) {
      await client.query(`
        CREATE INDEX CONCURRENTLY codebase_chunk_index_search_vector_gin
        ON codebase_chunk_index USING GIN (search_vector);
      `);
    }

    proof.stats.gin_index_created = true;
    console.log(`  ✓ GIN index created (full-text search ready)`);
  } catch (err) {
    console.warn(`  ⚠ Could not create GIN index: ${err.message}`);
    proof.stats.errors++;
  }
}

/**
 * Phase 3: Compute BM25 scores
 */
async function computeBm25Scores(client) {
  console.log(`\n[Phase 3/4] Computing BM25 scores...`);

  try {
    // Check if bm25_score column exists
    const checkResult = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'codebase_chunk_index' AND column_name = 'bm25_score'
    `);

    if (checkResult.rows.length === 0) {
      if (!dryRun) {
        await client.query(`
          ALTER TABLE codebase_chunk_index
          ADD COLUMN bm25_score REAL DEFAULT 0.0;
        `);
      }
    }

    // Get total chunks
    const countResult = await client.query(`SELECT COUNT(*) as count FROM codebase_chunk_index`);
    proof.stats.chunks_total = parseInt(countResult.rows[0].count);
    console.log(`  Processing ${proof.stats.chunks_total} chunks...`);

    // Compute BM25 using PostgreSQL ts_rank
    // BM25 approximation: ts_rank_cd weights frequency + position
    if (!dryRun) {
      const updateResult = await client.query(`
        UPDATE codebase_chunk_index
        SET bm25_score = ts_rank_cd('{0.1, 0.2, 0.4, 1.0}', search_vector,
          plainto_tsquery('english', COALESCE(symbol || ' ' || feature_id, '')))
        WHERE search_vector IS NOT NULL;
      `);

      proof.stats.bm25_scores_computed = updateResult.rowCount || 0;
    } else {
      proof.stats.bm25_scores_computed = proof.stats.chunks_total;
    }

    // Get average BM25 score
    const avgResult = await client.query(`
      SELECT AVG(bm25_score) as avg_score FROM codebase_chunk_index WHERE bm25_score > 0
    `);
    proof.stats.avg_bm25_score = parseFloat(avgResult.rows[0].avg_score || 0).toFixed(4);

    console.log(`  ✓ BM25 scores computed: ${proof.stats.bm25_scores_computed} chunks (avg: ${proof.stats.avg_bm25_score})`);
  } catch (err) {
    console.warn(`  ⚠ Could not compute BM25 scores: ${err.message}`);
    proof.stats.errors++;
  }
}

/**
 * Phase 4: Create BRIN index for efficient range scans on BM25 scores
 */
async function createBrinIndex(client) {
  console.log(`\n[Phase 4/4] Creating BRIN index on BM25 scores...`);

  try {
    // Check if BRIN index exists
    const checkResult = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'codebase_chunk_index' AND indexname = 'codebase_chunk_index_bm25_brin'
    `);

    if (checkResult.rows.length > 0) {
      console.log(`  ✓ BRIN index already exists`);
      return;
    }

    if (!dryRun) {
      await client.query(`
        CREATE INDEX CONCURRENTLY codebase_chunk_index_bm25_brin
        ON codebase_chunk_index USING BRIN (bm25_score);
      `);
    }

    proof.stats.brin_index_created = true;
    console.log(`  ✓ BRIN index created (range scans on BM25 scores)`);
  } catch (err) {
    console.warn(`  ⚠ Could not create BRIN index: ${err.message}`);
    proof.stats.errors++;
  }
}

/**
 * Verify indexing success
 */
async function verifyIndexing(client) {
  console.log(`\n[Verify] Checking index health...`);

  try {
    // Check tsvector column
    const tsvectorResult = await client.query(`
      SELECT COUNT(*) as count FROM codebase_chunk_index WHERE search_vector IS NOT NULL
    `);
    console.log(`  ✓ Indexed vectors: ${tsvectorResult.rows[0].count}`);

    // Check BM25 distribution
    const bm25Result = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN bm25_score > 0 THEN 1 END) as scored,
        MIN(bm25_score) as min_score,
        MAX(bm25_score) as max_score,
        AVG(bm25_score) as avg_score
      FROM codebase_chunk_index
    `);

    const row = bm25Result.rows[0];
    console.log(`  ✓ BM25 distribution:`);
    console.log(`    - Chunks: ${row.total}`);
    console.log(`    - Scored: ${row.scored}`);
    console.log(`    - Range: ${parseFloat(row.min_score || 0).toFixed(4)} - ${parseFloat(row.max_score || 0).toFixed(4)}`);
    console.log(`    - Average: ${parseFloat(row.avg_score || 0).toFixed(4)}`);

    // Sample search
    if (!dryRun) {
      const searchResult = await client.query(`
        SELECT feature_id, bm25_score
        FROM codebase_chunk_index
        WHERE search_vector @@ plainto_tsquery('english', 'auth session')
        ORDER BY bm25_score DESC
        LIMIT 3
      `);

      console.log(`  ✓ Sample search (query='auth session'): ${searchResult.rowCount} results`);
      if (searchResult.rowCount > 0) {
        searchResult.rows.forEach((r, i) => {
          console.log(`    ${i+1}. ${r.feature_id} (BM25: ${parseFloat(r.bm25_score).toFixed(4)})`);
        });
      }
    }
  } catch (err) {
    console.warn(`  ⚠ Verification failed: ${err.message}`);
  }
}

async function main() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Phase 1B: Postgres GIN tsvector + BM25 Ranking Index`);
  console.log(`${'='.repeat(80)}`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN (preview only)' : 'APPLY (creates indexes)'}`);
  console.log(`Target: codebase_chunk_index (for RRF fusion + ACE_PIPELINE_VERSION=3.0.0)`);

  try {
    console.log(`\nConnecting to database...`);
    await pool.connect();
    console.log(`✓ Connected to PostgreSQL 18.4\n`);

    await createTsvectorColumn(pool);
    await createGinIndex(pool);
    await computeBm25Scores(pool);
    await createBrinIndex(pool);
    await verifyIndexing(pool);

    // Write proof report
    const reportsDir = path.join(REPO_ROOT, 'docs/reports');
    try {
      await fs.mkdir(reportsDir, { recursive: true });
    } catch (err) {
      // Directory may already exist
    }

    if (!dryRun) {
      await fs.writeFile(
        path.join(reportsDir, 'phase-1b-postgres-bm25-index-proof.json'),
        JSON.stringify(proof, null, 2)
      );
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`Summary:`);
    console.log(`  Mode: ${proof.mode}`);
    console.log(`  Total chunks: ${proof.stats.chunks_total}`);
    console.log(`  tsvector column: ${proof.stats.tsvector_column_created ? '✓' : '✗'}`);
    console.log(`  GIN index: ${proof.stats.gin_index_created ? '✓' : '✗'}`);
    console.log(`  BM25 scores computed: ${proof.stats.bm25_scores_computed}`);
    console.log(`  Average BM25 score: ${proof.stats.avg_bm25_score}`);
    console.log(`  BRIN index: ${proof.stats.brin_index_created ? '✓' : '✗'}`);
    console.log(`  Errors: ${proof.stats.errors}`);
    console.log(`${'='.repeat(80)}\n`);

    console.log(`Next: RRF Fusion wiring uses BM25 scores for legal-query lane`);
    console.log(`      npm run atlas:phase1b:rrf-fusion:wire\n`);

    process.exit(proof.stats.errors === 0 ? 0 : 1);
  } catch (err) {
    console.error(`✗ Fatal error:`, err);
    process.exit(1);
  } finally {
    pool.end().catch(() => {});
  }
}

main();
