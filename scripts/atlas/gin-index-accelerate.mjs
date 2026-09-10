#!/usr/bin/env node
/**
 * Index acceleration for text/metadata and canonical semantic_768.
 *
 * Canonical dense Postgres owner:
 *   codebase_chunk_index.content_embedding halfvec(768)
 *
 * This helper no longer creates an ANN index over the non-canonical
 * content_embedding_768 vector(768) compatibility surface.
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
const pgPool = new pg.Pool({ connectionString: resolveDatabaseUrl(env) });
const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

const indexes = [
  {
    name: 'idx_atlas_packets_summary_trgm', table: 'atlas_packets', column: 'summary', type: 'GIN (trgm)',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packets_summary_trgm ON atlas_packets USING GIN (summary gin_trgm_ops) WHERE summary IS NOT NULL`,
    purpose: 'Trigram search on packet summaries for LIKE and similarity()',
  },
  {
    name: 'idx_atlas_packets_metadata_jsonb', table: 'atlas_packets', column: 'metadata (JSONB)', type: 'GIN',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packets_metadata_jsonb ON atlas_packets USING GIN (metadata) WHERE metadata IS NOT NULL`,
    purpose: 'JSONB containment and key search on packet metadata',
  },
  {
    name: 'idx_codebase_chunk_content_trgm', table: 'codebase_chunk_index', column: 'content', type: 'GIN (trgm)',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_codebase_chunk_content_trgm ON codebase_chunk_index USING GIN (content gin_trgm_ops) WHERE content IS NOT NULL AND LENGTH(content) > 20`,
    purpose: 'Trigram search on chunk content',
  },
  {
    name: 'codebase_chunk_index_content_hnsw', table: 'codebase_chunk_index', column: 'content_embedding halfvec(768)', type: 'HNSW (halfvec)',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS codebase_chunk_index_content_hnsw ON codebase_chunk_index USING hnsw (content_embedding halfvec_cosine_ops) WITH (m = 16, ef_construction = 200) WHERE content_embedding IS NOT NULL`,
    purpose: 'Canonical semantic_768 cosine ANN; matches the current halfvec(768) owner.',
  },
  {
    name: 'idx_atlas_packets_feature_id_partial', table: 'atlas_packets', column: 'feature_id', type: 'BTREE (partial)',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packets_feature_id_partial ON atlas_packets (feature_id) WHERE feature_id IS NOT NULL`,
    purpose: 'Fast feature_id lookups for clustering and grouping',
  },
  {
    name: 'idx_atlas_packets_som_cluster_partial', table: 'atlas_packets', column: 'som_row, som_col', type: 'BTREE (partial)',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atlas_packets_som_partial ON atlas_packets (som_row, som_col) WHERE som_row IS NOT NULL AND som_col IS NOT NULL`,
    purpose: 'SOM cell lookup for topology routing',
  },
];

async function main() {
  try {
    console.log(`Index acceleration mode: ${DRY_RUN ? 'DRY_RUN' : 'APPLY'}`);
    const type = await pgPool.query(`SELECT format_type(a.atttypid,a.atttypmod) AS declared_type FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='codebase_chunk_index' AND a.attname='content_embedding' AND a.attnum>0 AND NOT a.attisdropped`);
    if (type.rows[0]?.declared_type !== 'halfvec(768)') throw new Error(`CANONICAL_VECTOR_TYPE_MISMATCH:${type.rows[0]?.declared_type ?? 'missing'}`);

    for (const [index, item] of indexes.entries()) {
      console.log(`${index + 1}. ${item.name}: ${item.table}.${item.column} — ${item.type}`);
      console.log(`   ${item.purpose}`);
    }

    const counts = await pgPool.query(`SELECT COUNT(*) FILTER (WHERE content_embedding IS NOT NULL)::bigint AS canonical_rows, COUNT(*) FILTER (WHERE content_embedding_768 IS NOT NULL)::bigint AS alternate_rows FROM codebase_chunk_index`);
    console.log('canonical content_embedding rows:', counts.rows[0].canonical_rows);
    console.log('alternate content_embedding_768 rows:', counts.rows[0].alternate_rows);

    if (DRY_RUN) return;
    for (const item of indexes) {
      console.log(`Creating/verifying ${item.name}...`);
      await pgPool.query(item.sql);
    }
    console.log('Index creation completed.');
  } catch (error) {
    console.error('Index acceleration failed:', error.message);
    process.exitCode = 1;
  } finally {
    await pgPool.end();
  }
}

await main();
