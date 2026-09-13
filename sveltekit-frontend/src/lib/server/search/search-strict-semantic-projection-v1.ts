import { getQdrantClient } from '$lib/server/vector/qdrant-singleton.js';
import { buildCodebaseQdrantFilter } from './qdrant-search.js';
import {
  mapStrictSemanticProjectionCandidateV1,
  type StrictSemanticProjectionCandidateV1,
} from './strict-semantic-projection-candidate-v1.js';

/**
 * Read-only exact Qdrant executor used by the ACE revision-bundle proof.
 *
 * Collection is REQUIRED rather than defaulted. Until semantic physical owner
 * reconciliation is complete, this helper must not choose between competing
 * physical projections on the caller's behalf.
 */
export async function searchStrictSemanticProjectionV1(input: {
  embedding: readonly number[];
  limit: number;
  collection: string;
}): Promise<StrictSemanticProjectionCandidateV1[]> {
  if (!input.collection.trim()) throw new Error('STRICT_SEMANTIC_COLLECTION_REQUIRED');
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 256) {
    throw new Error(`STRICT_SEMANTIC_LIMIT_INVALID:${input.limit}`);
  }
  if (input.embedding.length !== 768) {
    throw new Error(`STRICT_SEMANTIC_QUERY_DIMENSION_MISMATCH:${input.embedding.length}`);
  }
  for (let index = 0; index < input.embedding.length; index += 1) {
    if (!Number.isFinite(input.embedding[index])) {
      throw new Error(`STRICT_SEMANTIC_QUERY_NON_FINITE:${index}`);
    }
  }

  const client = getQdrantClient();
  const response = await client.query(input.collection, {
    query: Array.from(input.embedding),
    using: 'content',
    limit: input.limit,
    filter: buildCodebaseQdrantFilter({ collection: input.collection }),
    params: { exact: true },
    with_payload: true,
    with_vector: false,
  });

  return (response.points ?? []).map((point) => mapStrictSemanticProjectionCandidateV1({
    id: point.id,
    score: point.score,
    payload: (point.payload ?? null) as Record<string, unknown> | null,
  }));
}
