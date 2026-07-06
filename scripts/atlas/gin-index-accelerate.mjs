#!/usr/bin/env node

/**
 * GIN Index Acceleration for Full-Text Search + Embedding Similarity
 *
 * Creates GIN indexes on:
 * - atlas_packets.summary (trgm trigram for LIKE/similarity)
 * - atlas_packets.metadata JSONB (for feature extraction)
 * - codebase_chunk_index.content (trgm for FTS)
 * - codebase_chunk_index.content_embedding (pgvector cosine_ops)
 *
 * Also adds partial indexes for performance:
 * - indexed packets only (summary IS NOT NULL)
 * - non-null embeddings only
 *
 * Usage:
 *   node scripts/atlas/gin-index-accelerate.mjs --dry-run
 *   node scripts/atlas/gin-index-accelerate.mjs --apply
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

config({ path: resolve('.', '.env') });

const env = loadRepoEnv(process.env);
const POSTGRES_URL = resolveDatabaseUrl(env);
const pgPool = new pg.Pool({ connectionString: POSTGRES_URL });

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  GIN Index Acceleration                                        ║');
console.log('║  Create indexes for FTS, JSONB, and vector similarity          ║');
console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'.padEnd(54)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

const indexes = [
  {
    name: 'idx_atlas_packets_summary_trgm',
    table: 'atlas_packets',
    column: 'summary',
    type: 'GIN (trgm)',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packets_summary_trgm
          ON atlas_packets USING GIN (summary gin_trgm_ops)
          WHERE summary IS NOT NULL`,
    purpose: 'Trigram search on packet summaries for LIKE and similarity()',
  },
  {
    name: 'idx_atlas_packets_metadata_jsonb',
    table: 'atlas_packets',
    column: 'metadata (JSONB)',
    type: 'GIN',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packets_metadata_jsonb
          ON atlas_packets USING GIN (metadata)
          WHERE metadata IS NOT NULL`,
    purpose: 'JSONB containment and key search on packet metadata',
  },
  {
    name: 'idx_codebase_chunk_content_trgm',
    table: 'codebase_chunk_index',
    column: 'content',
    type: 'GIN (trgm)',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_codebase_chunk_content_trgm
          ON codebase_chunk_index USING GIN (content gin_trgm_ops)
          WHERE content IS NOT NULL AND LENGTH(content) > 20`,
    purpose: 'Trigram search on chunk content for BM25 fallback',
  },
  {
    name: 'idx_codebase_chunk_embedding_cosine',
    table: 'codebase_chunk_index',
    column: 'content_embedding (pgvector)',
    type: 'HNSW (pgvector)',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_codebase_chunk_embedding_cosine
          ON codebase_chunk_index USING hnsw (content_embedding vector_cosine_ops)
          WITH (m = 16, ef_construction = 64)
          WHERE content_embedding IS NOT NULL`,
    purpose: 'HNSW vector similarity for cosine distance ANN search',
  },
  {
    name: 'idx_atlas_packets_feature_id_partial',
    table: 'atlas_packets',
    column: 'feature_id',
    type: 'BTREE (partial)',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packets_feature_id_partial
          ON atlas_packets (feature_id)
          WHERE feature_id IS NOT NULL`,
    purpose: 'Fast feature_id lookups for clustering and grouping',
  },
  {
    name: 'idx_atlas_packets_som_cluster_partial',
    table: 'atlas_packets',
    column: 'som_row, som_col',
    type: 'BTREE (partial)',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packets_som_partial
          ON atlas_packets (som_row, som_col)
          WHERE som_row IS NOT NULL AND som_col IS NOT NULL`,
    purpose: 'SOM cell lookup for topology routing',
  },
];

async function ginIndexAccelerate() {
  try {
    console.log('📋 Index Plan\n');

    indexes.forEach((idx, i) => {
      console.log(`${i + 1}. ${idx.name}`);
      console.log(`   Table: ${idx.table}`);
      console.log(`   Column: ${idx.column}`);
      console.log(`   Type: ${idx.type}`);
      console.log(`   Purpose: ${idx.purpose}`);
      console.log();
    });

    if (DRY_RUN) {
      console.log('📊 Step 1: Check existing indexes\n');

      const existingRes = await pgPool.query(`
        SELECT schemaname, tablename, indexname, indexdef
        FROM pg_indexes
        WHERE tablename IN ('atlas_packets', 'codebase_chunk_index')
        AND indexname LIKE 'idx_%'
        ORDER BY tablename, indexname
      `);

      console.log(`Existing indexes: ${existingRes.rows.length}\n`);
      existingRes.rows.forEach((row) => {
        console.log(`  ${row.indexname} (${row.tablename})`);
      });
      console.log();

      console.log('📊 Step 2: Estimate index creation time\n');

      const packetCountRes = await pgPool.query(
        'SELECT COUNT(*) as count FROM atlas_packets WHERE summary IS NOT NULL'
      );
      const chunkCountRes = await pgPool.query(
        'SELECT COUNT(*) as count FROM codebase_chunk_index WHERE content_embedding IS NOT NULL'
      );

      const packetSummaryCount = parseInt(packetCountRes.rows[0].count);
      const chunkEmbeddingCount = parseInt(chunkCountRes.rows[0].count);

      console.log(`  atlas_packets with summary: ${packetSummaryCount}`);
      console.log(`  codebase_chunk_index with embeddings: ${chunkEmbeddingCount}`);
      console.log();

      // Estimate time (rough)
      const trigmTime = Math.max(5, Math.ceil(packetSummaryCount / 100000 * 30)); // ~30s per 100K rows
      const hnswnTime = Math.max(10, Math.ceil(chunkEmbeddingCount / 50000 * 60)); // ~60s per 50K vectors

      console.log(`  Estimated creation time:`);
      console.log(`    TRG indexes: ~${trigmTime}s each`);
      console.log(`    HNSW index: ~${hnswnTime}s`);
      console.log(`    Total: ~${trigmTime * 2 + hnswnTime + 20}s (with CONCURRENTLY flag)`);
      console.log();

      console.log('✅ DRY-RUN: Would create GIN indexes\n');

    } else {
      console.log('💾 Step 1: Create indexes (CONCURRENTLY)\n');

      for (const idx of indexes) {
        try {
          console.log(`Creating ${idx.name}...`);
          await pgPool.query(idx.sql);
          console.log(`  ✅ Created\n`);
        } catch (err) {
          if (err.message.includes('already exists')) {
            console.log(`  ⚠️  Already exists\n`);
          } else {
            console.error(`  ❌ Error: ${err.message}\n`);
          }
        }
      }

      console.log('📊 Step 2: Verify index creation\n');

      const verifyRes = await pgPool.query(`
        SELECT indexname, idx_scan, idx_tup_read, idx_tup_fetch, pg_size_pretty(pg_relation_size(indexrelid)) as size
        FROM pg_stat_user_indexes
        WHERE indexname LIKE 'idx_atlas%' OR indexname LIKE 'idx_codebase%'
        ORDER BY indexrelname
      `);

      console.log(`Verified indexes: ${verifyRes.rows.length}\n`);
      verifyRes.rows.forEach((row) => {
        console.log(`  ${row.indexname}`);
        console.log(`    Size: ${row.size}`);
        console.log(`    Scans: ${row.idx_scan}, Tuples read: ${row.idx_tup_read}`);
      });
      console.log();

      console.log('✅ GIN indexes created successfully!');
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    if (process.argv.includes('--verbose')) console.error(err.stack);
    process.exit(1);
  } finally {
    await pgPool.end();
  }
}

ginIndexAccelerate();
