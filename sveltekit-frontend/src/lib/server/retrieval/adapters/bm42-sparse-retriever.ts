import {
  generateLegacyHashedSparseVector,
  LEGACY_HASHED_SPARSE_ALGORITHM_ID,
} from '$lib/server/vector/bm42-sparse.js';
import { QDRANT_SPARSE_VECTOR_NAME } from '$lib/server/vector/retrieval-semantics.js';
import { getQdrantManager } from '$lib/server/vector/qdrant-manager.js';
import type { Retriever, LaneCandidate, RetrievalInput } from '../lane-contracts.js';
import { validateCandidate } from '../lane-contracts.js';
import { normalizeQdrantPoints } from './qdrant-dense-retriever.js';

const COLLECTION = 'codebase_chunks_384_hybrid';

/**
 * Historical sparse adapter.
 *
 * The filename/lane lineage says BM42, but the query representation is the
 * legacy FNV-1a + log(1+TF) + legal-token-boost codec, not Qdrant BM42.
 * Compatibility names stay stable while metadata exposes the real algorithm.
 */
export function createBm42SparseRetriever(): Retriever {
  return {
    lane: 'sparse' as const,

    async retrieve(input: RetrievalInput): Promise<LaneCandidate[]> {
      const sparseVector = generateLegacyHashedSparseVector(input.query);
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
          `[legacy-hashed-sparse-retriever] ${COLLECTION} sparse search failed (lane disabled):`,
          (err as Error).message
        );
        return [];
      }

      const points = normalizeQdrantPoints(rawResponse);
      const candidates: LaneCandidate[] = [];

      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        const payload = point.payload ?? {};
        const packetKey = payload['packet_key'] ?? payload['symbol_version_id'];
        const sourceRef = payload['source_ref'];

        if (typeof packetKey !== 'string' || packetKey.length === 0) continue;
        if (typeof sourceRef !== 'string' || sourceRef.length === 0) continue;

        const candidate = validateCandidate({
          packetKey,
          packetId: payload['chunk_id'] as string | undefined,
          qdrantPointId: String(point.id),
          sourceRef,
          rank: i + 1,
          score: point.score ?? null,
          lane: 'sparse' as const,
          metadata: {
            ...payload,
            retrieval_algorithm_id: LEGACY_HASHED_SPARSE_ALGORITHM_ID,
            retrieval_algorithm_family: 'LEXICAL_SPARSE_HASHED',
            historical_lane_name: 'bm42',
            qdrant_sparse_vector_name: QDRANT_SPARSE_VECTOR_NAME,
            is_true_qdrant_bm42: false,
          },
        });

        if (candidate) candidates.push(candidate);
      }

      return candidates;
    },
  };
}
