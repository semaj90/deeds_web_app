/**
 * Historical Qdrant `bm42` sparse-lane adapter.
 *
 * IMPORTANT: the currently indexed/query vector produced by bm42-sparse.ts is
 * Atlas's legacy FNV/log-TF sparse representation, NOT Qdrant BM42. The lane
 * name is retained temporarily for storage/API compatibility only. Every result
 * carries explicit algorithm provenance so downstream fusion/evaluation cannot
 * mistake it for true BM42 evidence.
 *
 * TODO(SPARSE-MIGRATION): create a separately versioned true BM42 collection/
 * adapter only after transformer attention-weight + IDF generation is proven.
 */

import { getQdrantManager } from '$lib/server/vector/qdrant-manager.js';
import {
  generateLegacyHashedSparseVector,
  LEGACY_HASHED_SPARSE_ALGORITHM,
  LEGACY_HASHED_SPARSE_PROOF_STATE,
} from '$lib/server/vector/bm42-sparse.js';
import { QDRANT_SPARSE_VECTOR_NAME } from '$lib/server/vector/retrieval-semantics.js';
import type { Retriever, LaneCandidate, RetrievalInput } from '../lane-contracts.js';
import { validateCandidate } from '../lane-contracts.js';
import { normalizeQdrantPoints } from './qdrant-dense-retriever.js';

export interface QdrantBM42RetrieverConfig {
  collection: string;
  /** Historical sparse-vector field name. Its current contents are legacy hashed sparse vectors. */
  sparseVectorName?: string;
}

export function createQdrantBM42Retriever(config: QdrantBM42RetrieverConfig): Retriever {
  const sparseVectorName = config.sparseVectorName ?? QDRANT_SPARSE_VECTOR_NAME;

  return {
    // Historical public lane identifier retained until a migration can change
    // persisted collection/vector names and fusion fixtures together.
    lane: 'bm42' as const,

    async retrieve(input: RetrievalInput): Promise<LaneCandidate[]> {
      const qdrant = getQdrantManager();
      const sparseVector = generateLegacyHashedSparseVector(input.query);
      if (sparseVector.indices.length === 0) return [];

      let rawResponse: unknown;
      try {
        rawResponse = await qdrant.querySparse({
          collection: config.collection,
          sparseVector,
          sparseVectorName,
          limit: input.limit,
          filter: input.filters as Record<string, unknown> | undefined,
        });
      } catch (err) {
        console.warn(
          `[qdrant-legacy-sparse-retriever] ${config.collection} sparse search failed (lane disabled):`,
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
          lane: 'bm42',
          metadata: {
            ...payload,
            sparse_algorithm: LEGACY_HASHED_SPARSE_ALGORITHM,
            sparse_proof_state: LEGACY_HASHED_SPARSE_PROOF_STATE,
            true_bm42: false,
            historical_lane_name: 'bm42',
          },
        };
        const valid = validateCandidate(candidate);
        if (valid) candidates.push(valid);
      }

      return candidates;
    },
  };
}
