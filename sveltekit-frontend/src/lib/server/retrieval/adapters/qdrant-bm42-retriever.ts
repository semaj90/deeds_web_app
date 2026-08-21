/**
 * Qdrant BM42 Sparse Retriever Adapter
 *
 * Compatibility wrapper for the historical hashed sparse Qdrant lane.
 * This is not true Qdrant BM42: it uses the legacy FNV-1a/log-TF codec until
 * a separately proven BM42 model owner and collection projection exist.
 *
 * Uses QdrantManager.querySparse — a direct Universal Query API call with a single
 * sparse query vector. Single-input RRF (multiQuerySearch with one prefetch) was
 * previously used here but adds no fusion value and obscures the native sparse score.
 *
 * Falls back to [] when the collection has no sparse vectors configured
 * (fail-closed, never throws). Sparse-support detection is handled inside querySparse.
 *
 * The physical field may retain the historical `bm42` name, but this adapter
 * reports the actual algorithm family so it cannot be mistaken for BM42.
 */

import { getQdrantManager } from '$lib/server/vector/qdrant-manager.js';
import {
  generateLegacyHashedSparseVector,
  LEGACY_HASHED_SPARSE_ALGORITHM_ID,
} from '$lib/server/vector/bm42-sparse.js';
import { QDRANT_SPARSE_VECTOR_NAME } from '$lib/server/vector/retrieval-semantics.js';
import type { Retriever, LaneCandidate, RetrievalInput } from '../lane-contracts.js';
import { validateCandidate } from '../lane-contracts.js';
import { normalizeQdrantPoints } from './qdrant-dense-retriever.js';

export interface QdrantBM42RetrieverConfig {
  collection: string;
  /** Historical physical field name; its presence does not prove BM42 semantics. */
  sparseVectorName?: string;
}

export function createQdrantBM42Retriever(config: QdrantBM42RetrieverConfig): Retriever {
  const sparseVectorName = config.sparseVectorName ?? QDRANT_SPARSE_VECTOR_NAME;

  return {
    lane: 'bm42' as const,

    async retrieve(input: RetrievalInput): Promise<LaneCandidate[]> {
      const qdrant = getQdrantManager();

      const sparseVector = generateLegacyHashedSparseVector(input.query);
      if (sparseVector.indices.length === 0) return [];

      let rawResponse: unknown;
      try {
        // querySparse uses the Universal Query API directly (client.query) with a
        // single sparse vector — not multiQuerySearch/RRF, which adds no value for
        // a single sub-query and obscures the native sparse score.
        rawResponse = await qdrant.querySparse({
          collection: config.collection,
          sparseVector,
          sparseVectorName,
          limit: input.limit,
          filter: input.filters as Record<string, unknown> | undefined,
        });
      } catch (err) {
        console.warn(
          `[qdrant-bm42-retriever] ${config.collection} sparse search failed (lane disabled):`,
          (err as Error).message
        );
        return [];
      }

      const points = normalizeQdrantPoints(rawResponse);

      const candidates: LaneCandidate[] = [];
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        const payload = point.payload ?? {};
        const packetKey = String(payload['packet_key'] ?? payload['symbol_version_id'] ?? '').trim();
        const sourceRef = String(payload['source_ref'] ?? '').trim();
        if (!packetKey || !sourceRef) continue;
        const candidate: LaneCandidate = {
          packetKey,
          qdrantPointId: String(point.id),
          sourceRef,
          rank: i + 1,
          score: point.score ?? null,
          lane: 'sparse',
          metadata: {
            ...payload,
            retrieval_algorithm_id: LEGACY_HASHED_SPARSE_ALGORITHM_ID,
            retrieval_algorithm_family: 'LEXICAL_SPARSE_HASHED',
            historical_lane_name: 'bm42',
            qdrant_sparse_vector_name: sparseVectorName,
            is_true_qdrant_bm42: false,
          },
        };
        const valid = validateCandidate(candidate);
        if (valid) candidates.push(valid);
      }

      return candidates;
    },
  };
}
