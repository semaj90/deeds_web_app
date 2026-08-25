/**
 * @deprecated Compatibility wrapper — function/type names here retain the
 * "bm25" label for existing callers, but this delegates to
 * `postgres-fts.js`'s `searchCodeLexical()`, which is PostgreSQL native
 * tsvector/GIN full-text search (ts_rank/websearch_to_tsquery), not BM25.
 * pg_search is not installed in this repo. New callers should import
 * `searchCodeLexical` from `$lib/server/search/postgres-fts.js` directly
 * and treat the lane as `postgres_tsvector_english`. See openspec/changes/
 * parent-atlas-neural-prefill-encoder/tasks.md's DBCTX-01/BM25 cleanup
 * entries for the naming rationale. Kept as-is (no export renames here)
 * to avoid a mechanical break across this file's callers.
 */

import { searchCodeLexical } from '$lib/server/search/postgres-fts.js';

/**
 * Search atlas_packets by text similarity using trigram matching.
 * Requires GIN index: CREATE INDEX idx_atlas_packets_summary_gin ON atlas_packets USING GIN (summary gin_trgm_ops);
 */
export interface Bm25SearchHit {
  id: string;
  similarity: number;
  summary: string;
  stable_key: string;
  file_path: string;
  // BM25/trigram search never populates these — vector-search-only fields.
  // Declared optional so cross-signal merge code (rrf-integration.ts) that
  // defensively reads them via `?? null`/`?? undefined` type-checks; real
  // values are always undefined from this signal.
  content_hash?: string | null;
  contentHash?: string | null;
  tree_node_id?: string | null;
  treeNodeId?: string | null;
  feature_id?: string | null;
  featureId?: string | null;
  feature_label?: string | null;
  featureLabel?: string | null;
  workspace_revision?: number | null;
  workspaceRevision?: number | null;
  som_cluster?: number | string | null;
}

export async function bm25SearchIndexed(
  query: string,
  limit: number = 20
): Promise<Bm25SearchHit[]> {
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
