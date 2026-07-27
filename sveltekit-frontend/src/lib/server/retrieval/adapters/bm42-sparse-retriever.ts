import { generateSparseVector } from '$lib/server/vector/bm42-sparse.js';
import { QDRANT_SPARSE_VECTOR_NAME } from '$lib/server/vector/retrieval-semantics.js';
import { getQdrantManager } from '$lib/server/vector/qdrant-manager.js';
import type { Retriever, LaneCandidate, RetrievalInput } from '../lane-contracts.js';
import { validateCandidate } from '../lane-contracts.js';
import { normalizeQdrantPoints } from './qdrant-dense-retriever.js';

const COLLECTION = 'codebase_chunks_384_hybrid';

/**
 * Legacy BM42 sparse lane used by SearchRuntime.
 * Keep the lane name stable, but route the request through QdrantManager.querySparse
 * so this path stays aligned with the repo's current Universal Query API contract.
 */
export function createBm42SparseRetriever(): Retriever {
  return {
    lane: 'sparse' as const,

    async retrieve(input: RetrievalInput): Promise<LaneCandidate[]> {
      const sparseVector = generateSparseVector(input.query);
      if (sparseVector.indices.length === 0) return [];

      const qdrant = getQdrantManager();

      let rawResponse: unknown;
      try {
        rawResponse = await qdrant.querySparse({
          collection: COLLECTION,
          sparseVector,
          sparseVectorName: QDRANT_SPARSE_VECTOR_NAME,
          limit: input.limit,
          filter: input.filters as Record<string, unknown> | undefined,
        });
      } catch (err) {
        console.warn(
          `[bm42-sparse-retriever] ${COLLECTION} sparse search failed (lane disabled):`,
          (err as Error).message
        );
        return [];
      }

      const points = normalizeQdrantPoints(rawResponse);
      const candidates: LaneCandidate[] = [];

      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        const payload = point.payload ?? {};
        const candidate = validateCandidate({
          packetKey: String(payload['packet_key'] ?? point.id),
          packetId: payload['chunk_id'] as string | undefined,
          qdrantPointId: String(point.id),
          sourceRef: String(payload['source_ref'] ?? ''),
          rank: i + 1,
          score: point.score ?? null,
          lane: 'sparse' as const,
          metadata: payload,
        });

        if (candidate) candidates.push(candidate);
      }

      return candidates;
    },
  };
}
