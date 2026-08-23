/**
 * Qdrant ANN Recall Adapter — Semantic vector search stage
 *
 * Executes HNSW approximate nearest neighbor search against the active Qdrant
 * codebase_chunks_768_v2 projection.
 * collection as the second recall stage in the Parent Atlas retrieval pipeline.
 *
 * Returns up to qdrantLimit candidates sorted by cosine similarity.
 */

import type { CandidateForIdentityResolution } from './identity-resolver.js';

export interface QdrantRecallOptions {
  query_vector: number[];
  limit: number;
  threshold?: number;
  with_payload?: boolean;
}

export interface QdrantRecallResult extends CandidateForIdentityResolution {
  retrieved_via: 'qdrant';
  similarity: number;
  payload?: Record<string, unknown>;
}

/**
 * Search Qdrant for nearest neighbors by semantic similarity
 *
 * Uses HNSW index on codebase_chunks_768_v2 collection. The adapter accepts
 * only native 768-dimensional semantic queries; Postgres remains identity owner.
 * Returns up to `limit` candidates sorted by cosine similarity (descending).
 */
export async function searchQdrantANN(
  qdrantUrl: string,
  options: QdrantRecallOptions
): Promise<QdrantRecallResult[]> {
  const { query_vector, limit, threshold = 0.0, with_payload = true } = options;

  if (!query_vector || query_vector.length !== 768) {
    throw new Error(`Query vector must be 768-dimensional, got ${query_vector.length}`);
  }

  try {
    const response = await fetch(`${qdrantUrl}/collections/codebase_chunks_768_v2/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: query_vector,
        limit,
        score_threshold: threshold,
        with_payload,
        with_vector: false
      })
    });

    if (!response.ok) {
      throw new Error(`Qdrant search failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      result: Array<{
        id: string;
        score: number;
        payload?: Record<string, unknown>;
      }>;
    };

    return data.result.map(hit => ({
      qdrant_point_id: hit.id,
      packet_key: hit.payload?.packet_key as string | undefined,
      source_ref: hit.payload?.source_ref as string | undefined,
      feature_id: hit.payload?.feature_id as string | undefined,
      content_hash: hit.payload?.content_hash as string | undefined,
      score: hit.score,
      similarity: hit.score,
      retrieved_via: 'qdrant',
      payload: hit.payload
    }));
  } catch (err) {
    throw new Error(`Qdrant ANN search error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Validate Qdrant results are well-formed
 *
 * Checks:
 * - All candidates have qdrant_point_id
 * - All candidates have payload with source_ref, feature_id, packet_key
 * - No NaN similarity scores
 * - Scores in valid range [0, 1]
 */
export function validateQdrantResults(
  candidates: QdrantRecallResult[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];

    if (!c.qdrant_point_id) {
      errors.push(`Candidate ${i}: missing qdrant_point_id`);
    }
    if (!c.source_ref) {
      errors.push(`Candidate ${i}: missing source_ref in payload`);
    }
    if (!c.feature_id) {
      errors.push(`Candidate ${i}: missing feature_id in payload`);
    }
    if (!c.packet_key) {
      errors.push(`Candidate ${i}: missing packet_key in payload`);
    }
    if (isNaN(c.similarity)) {
      errors.push(`Candidate ${i}: NaN similarity score`);
    }
    if (c.similarity < 0 || c.similarity > 1) {
      errors.push(`Candidate ${i}: similarity out of range [0, 1]: ${c.similarity}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Filter Qdrant results by source scope (optional)
 *
 * Constrains results to specific directories or files.
 */
export function filterQdrantBySourceScope(
  candidates: QdrantRecallResult[],
  sourceScope?: string[]
): QdrantRecallResult[] {
  if (!sourceScope || sourceScope.length === 0) {
    return candidates;
  }

  return candidates.filter(c => {
    if (!c.source_ref) return false;
    return sourceScope.some(pattern => {
      const regex = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      return new RegExp(`^${regex}$`).test(c.source_ref);
    });
  });
}

/**
 * Merge BM25 and Qdrant results before RRF fusion
 *
 * Combines candidates from both recall stages into a single set.
 * Duplicates (same packet_key) are preserved at this stage for identity resolution
 * to handle in the next step.
 */
export function mergeBM25AndQdrant(
  bm25Candidates: Array<{ score: number; [key: string]: unknown }>,
  qdrantCandidates: Array<{ similarity: number; [key: string]: unknown }>
): Array<{ score: number; source: string; [key: string]: unknown }> {
  return [
    ...bm25Candidates.map(c => ({ ...c, source: 'bm25', score: c.score })),
    ...qdrantCandidates.map(c => ({ ...c, source: 'qdrant', score: c.similarity }))
  ];
}

/**
 * Query embedding caching (optional)
 *
 * Candidates from Qdrant are scored by embedding similarity.
 * Cache hit on identical embedding = skip ANN search cost.
 */
export interface EmbeddingCache {
  get(query_hash: string): number[] | null;
  set(query_hash: string, embedding: number[], ttl_seconds?: number): void;
}

/**
 * Hash a query string for embedding cache lookup
 */
export function hashQueryForCache(query: string): string {
  // SHA-256 would be ideal; for now use a simple hash
  let hash = 0;
  for (let i = 0; i < query.length; i++) {
    const char = query.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `q:${Math.abs(hash).toString(36)}`;
}
