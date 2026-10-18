#!/usr/bin/env node
/**
 * APPLY-VECTOR-INDEX-CLEANUP-V1
 *
 * Governed execution of vector index reconciliation on `codebase_chunk_index`:
 *   1. Drop obsolete idx_codebase_chunk_summary_embedding_384_hnsw (10 rows).
 *   2. Drop obsolete idx_cci_kmeans384_cluster.
 *   3. Drop redundant idx_codebase_chunk_summary_embedding_ivfflat.
 *   4. Create partial HNSW index idx_codebase_chunk_summary_embedding_768_hnsw (WHERE summary_embedding IS NOT NULL).
 *   5. Verify indisvalid = true on candidate summary index, then drop old unfiltered codebase_chunk_index_summary_hnsw.
 *   6. Create partial HNSW index idx_codebase_chunk_error_embedding_768_hnsw (WHERE error_embedding IS NOT NULL).
 *   7. Verify indisvalid = true on candidate error index, then drop old unfiltered idx_codebase_chunk_index_error_embedding_hnsw.
 *
 * Safety & Governance:
 *   - Runs outside transaction blocks using CONCURRENTLY.
 *   - Requires explicit flags --apply --confirm-apply.
 *   - Validates indisvalid before dropping superseded indexes.
 *   - Writes audit receipt to docs/reports/vector-index-cleanup-receipt-v1.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { REPO_ROOT, loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const REPORT_PATH = path.join(REPO_ROOT, 'docs/reports/vector-index-cleanup-receipt-v1.json');

const args = process.argv.slice(2);
const isApply = args.includes('--apply');
const isConfirmed = args.includes('--confirm-apply');

async function checkIndexValid(client, indexName) {
  const res = await client.query(`
    SELECT c.relname, i.indisvalid
    FROM pg_class c
    JOIN pg_index i ON i.indexrelid = c.oid
    WHERE c.relname = $1
  `, [indexName]);
  if (res.rows.length === 0) return false;
  return res.rows[0].indisvalid === true;
}

async function main() {
  const env = loadRepoEnv();
  const dbUrl = resolveDatabaseUrl(env);
  const client = new pg.Client({ connectionString: dbUrl });

  console.log('Connecting to PostgreSQL...');
  await client.connect();

  const receipt = {
    schema: 'atlas.vector-index-cleanup-receipt.v1',
    executedAt: new Date().toISOString(),
    dryRun: !isApply,
    actionsExecuted: [],
    verification: {},
  };

  try {
    if (!isApply) {
      console.log('DRY RUN MODE: No changes will be made. Pass --apply --confirm-apply to execute.');
      console.log('Planned steps:');
      console.log('  1. DROP INDEX CONCURRENTLY IF EXISTS idx_codebase_chunk_summary_embedding_384_hnsw');
      console.log('  2. DROP INDEX CONCURRENTLY IF EXISTS idx_cci_kmeans384_cluster');
      console.log('  3. DROP INDEX CONCURRENTLY IF EXISTS idx_codebase_chunk_summary_embedding_ivfflat');
      console.log('  4. CREATE INDEX CONCURRENTLY idx_codebase_chunk_summary_embedding_768_hnsw (partial)');
      console.log('  5. DROP INDEX CONCURRENTLY IF EXISTS codebase_chunk_index_summary_hnsw');
      console.log('  6. CREATE INDEX CONCURRENTLY idx_codebase_chunk_error_embedding_768_hnsw (partial)');
      console.log('  7. DROP INDEX CONCURRENTLY IF EXISTS idx_codebase_chunk_index_error_embedding_hnsw');
      return;
    }

    if (!isConfirmed) {
      throw new Error('APPLY_REFUSED: --apply requires explicit --confirm-apply flag.');
    }

    console.log('\n--- Step 1: Dropping obsolete 384-D indexes ---');
    console.log('Executing: DROP INDEX CONCURRENTLY IF EXISTS idx_codebase_chunk_summary_embedding_384_hnsw');
    await client.query('DROP INDEX CONCURRENTLY IF EXISTS idx_codebase_chunk_summary_embedding_384_hnsw');
    receipt.actionsExecuted.push('DROP INDEX CONCURRENTLY IF EXISTS idx_codebase_chunk_summary_embedding_384_hnsw');

    console.log('Executing: DROP INDEX CONCURRENTLY IF EXISTS idx_cci_kmeans384_cluster');
    await client.query('DROP INDEX CONCURRENTLY IF EXISTS idx_cci_kmeans384_cluster');
    receipt.actionsExecuted.push('DROP INDEX CONCURRENTLY IF EXISTS idx_cci_kmeans384_cluster');

    console.log('\n--- Step 2: Dropping redundant IVFFlat summary index ---');
    console.log('Executing: DROP INDEX CONCURRENTLY IF EXISTS idx_codebase_chunk_summary_embedding_ivfflat');
    await client.query('DROP INDEX CONCURRENTLY IF EXISTS idx_codebase_chunk_summary_embedding_ivfflat');
    receipt.actionsExecuted.push('DROP INDEX CONCURRENTLY IF EXISTS idx_codebase_chunk_summary_embedding_ivfflat');

    console.log('\n--- Step 3: Creating partial 768-D summary HNSW index ---');
    console.log('Executing: CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_codebase_chunk_summary_embedding_768_hnsw...');
    await client.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_codebase_chunk_summary_embedding_768_hnsw
          ON public.codebase_chunk_index USING hnsw (summary_embedding halfvec_cosine_ops)
          WITH (m = 16, ef_construction = 200)
          WHERE (summary_embedding IS NOT NULL)
    `);
    receipt.actionsExecuted.push('CREATE INDEX CONCURRENTLY idx_codebase_chunk_summary_embedding_768_hnsw (partial)');

    const summaryValid = await checkIndexValid(client, 'idx_codebase_chunk_summary_embedding_768_hnsw');
    console.log(`idx_codebase_chunk_summary_embedding_768_hnsw indisvalid: ${summaryValid}`);
    if (!summaryValid) {
      throw new Error('CANDIDATE_SUMMARY_INDEX_INVALID: Aborting before dropping old summary index.');
    }

    console.log('\n--- Step 4: Dropping old unfiltered summary HNSW index ---');
    console.log('Executing: DROP INDEX CONCURRENTLY IF EXISTS codebase_chunk_index_summary_hnsw');
    await client.query('DROP INDEX CONCURRENTLY IF EXISTS codebase_chunk_index_summary_hnsw');
    receipt.actionsExecuted.push('DROP INDEX CONCURRENTLY IF EXISTS codebase_chunk_index_summary_hnsw');

    console.log('\n--- Step 5: Creating partial 768-D error HNSW index ---');
    console.log('Executing: CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_codebase_chunk_error_embedding_768_hnsw...');
    await client.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_codebase_chunk_error_embedding_768_hnsw
          ON public.codebase_chunk_index USING hnsw (error_embedding halfvec_cosine_ops)
          WITH (m = 16, ef_construction = 64)
          WHERE (error_embedding IS NOT NULL)
    `);
    receipt.actionsExecuted.push('CREATE INDEX CONCURRENTLY idx_codebase_chunk_error_embedding_768_hnsw (partial)');

    const errorValid = await checkIndexValid(client, 'idx_codebase_chunk_error_embedding_768_hnsw');
    console.log(`idx_codebase_chunk_error_embedding_768_hnsw indisvalid: ${errorValid}`);
    if (!errorValid) {
      throw new Error('CANDIDATE_ERROR_INDEX_INVALID: Aborting before dropping old error index.');
    }

    console.log('\n--- Step 6: Dropping old unfiltered error HNSW index ---');
    console.log('Executing: DROP INDEX CONCURRENTLY IF EXISTS idx_codebase_chunk_index_error_embedding_hnsw');
    await client.query('DROP INDEX CONCURRENTLY IF EXISTS idx_codebase_chunk_index_error_embedding_hnsw');
    receipt.actionsExecuted.push('DROP INDEX CONCURRENTLY IF EXISTS idx_codebase_chunk_index_error_embedding_hnsw');

    // Step 7: Post-apply verification
    console.log('\n--- Post-apply verification ---');
    const remainingIdxRes = await client.query(`
      SELECT
        c.relname AS index_name,
        am.amname AS method,
        pg_size_pretty(pg_relation_size(c.oid)) AS pretty_size,
        pg_get_indexdef(c.oid) AS definition
      FROM pg_class c
      JOIN pg_index i ON i.indexrelid = c.oid
      JOIN pg_am am ON am.oid = c.relam
      WHERE i.indrelid = 'codebase_chunk_index'::regclass
        AND am.amname IN ('hnsw', 'ivfflat')
      ORDER BY pg_relation_size(c.oid) DESC
    `);

    receipt.verification = {
      summaryIndexValid: summaryValid,
      errorIndexValid: errorValid,
      remainingVectorIndexes: remainingIdxRes.rows.map((r) => ({
        indexName: r.index_name,
        method: r.method,
        size: r.pretty_size,
        definition: r.definition,
      })),
    };

    console.log(`Active vector indexes remaining: ${remainingIdxRes.rows.length}`);
    for (const idx of remainingIdxRes.rows) {
      console.log(`  - ${idx.index_name} (${idx.method}): ${idx.pretty_size}`);
    }

    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(receipt, null, 2), 'utf8');
    console.log(`\nReceipt successfully written to ${REPORT_PATH}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('\nEXECUTION FAILED:', err);
  process.exit(1);
});
