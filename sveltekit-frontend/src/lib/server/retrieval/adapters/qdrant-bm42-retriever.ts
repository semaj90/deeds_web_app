/**
 * Qdrant BM42 Sparse Retriever Adapter
 *
 * Wraps Qdrant sparse vector search (BM42) as a Retriever.
 * BM42 is the "contextual lexical matching" lane — strongest for rare identifiers,
 * method names, and technical terminology that dense search underweights.
 *
 * Uses QdrantManager.querySparse — a direct Universal Query API call with a single
 * sparse query vector. Single-input RRF (multiQuerySearch with one prefetch) was
 * previously used here but adds no fusion value and obscures the native sparse score.
 *
 * Falls back to [] when the collection has no sparse vectors configured
 * (fail-closed, never throws). Sparse-support detection is handled inside querySparse.
 *
 * Section 7 of the Atlas spec: BM42 sits between BM25 (PostgreSQL FTS) and
 * dense (EmbeddingGemma) in the retrieval fan-out.
 */

import { getQdrantManager } from '$lib/server/vector/qdrant-manager.js';
import { generateSparseVector } from '$lib/server/vector/bm42-sparse.js';
import { QDRANT_SPARSE_VECTOR_NAME } from '$lib/server/vector/retrieval-semantics.js';
import type { Retriever, LaneCandidate, RetrievalInput } from '../lane-contracts.js';
import { validateCandidate } from '../lane-contracts.js';
import { normalizeQdrantPoints } from './qdrant-dense-retriever.js';

export interface QdrantBM42RetrieverConfig {
  collection: string;
  /** Name of the sparse vector field in the collection (default: 'bm42_sparse') */
  sparseVectorName?: string;
}

export function createQdrantBM42Retriever(config: QdrantBM42RetrieverConfig): Retriever {
  const sparseVectorName = config.sparseVectorName ?? QDRANT_SPARSE_VECTOR_NAME;

  return {
    lane: 'bm42' as const,

    async retrieve(input: RetrievalInput): Promise<LaneCandidate[]> {
      const qdrant = getQdrantManager();

      const sparseVector = generateSparseVector(input.query);
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
        const candidate: LaneCandidate = {
          packetKey: String(payload['packet_key'] ?? point.id),
          qdrantPointId: String(point.id),
          sourceRef: String(payload['source_ref'] ?? ''),
          rank: i + 1,
          score: point.score ?? null,
          lane: 'bm42',
          metadata: payload,
        };
        const valid = validateCandidate(candidate);
        if (valid) candidates.push(valid);
      }

      return candidates;
    },
  };
}
