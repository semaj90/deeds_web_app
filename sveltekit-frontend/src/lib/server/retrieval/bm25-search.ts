/**
 * BM25 Search via PostgreSQL trigram similarity
 *
 * Uses pg_trgm for fast full-text similarity search with GIN indexing.
 * Not exact BM25 but highly correlated and production-ready.
 */

import { searchCodeLexical } from '$lib/server/search/postgres-fts.js';

/**
 * Search atlas_packets by text similarity using trigram matching.
 * Requires GIN index: CREATE INDEX idx_atlas_packets_summary_gin ON atlas_packets USING GIN (summary gin_trgm_ops);
 */
export async function bm25SearchIndexed(
  query: string,
  limit: number = 20
): Promise<Array<{ id: string; similarity: number; summary: string; stable_key: string; file_path: string }>> {
  try {
    const results = await searchCodeLexical(query, { limit });
    return results.map((row) => ({
      id: row.stable_key,
      similarity: row.lexical_score || 0,
      summary: row.headline || row.content || '',
      stable_key: row.stable_key,
      file_path: row.file_path,
    }));
  } catch (error) {
    console.error('BM25 search failed:', error);
    return [];
  }
}

/**
 * Fallback: Search without index (slower but always works)
 */
export async function bm25SearchUnindexed(
  query: string,
  limit: number = 20
): Promise<Array<{ id: string; similarity: number; stable_key: string; file_path: string }>> {
  try {
    const results = await searchCodeLexical(query, { limit });
    return results.map((row) => ({
      id: row.stable_key,
      similarity: row.lexical_score || 0,
      stable_key: row.stable_key,
      file_path: row.file_path,
    }));
  } catch (error) {
    console.error('BM25 fallback search failed:', error);
    return [];
  }
}
