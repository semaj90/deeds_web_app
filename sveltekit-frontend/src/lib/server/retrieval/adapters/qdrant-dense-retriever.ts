/**
 * Qdrant Dense Retriever Adapter
 *
 * Wraps Qdrant ANN search as a Retriever.
 * Normalizes the response shape from all known Qdrant API variants.
 * Validates the embedding contract before sending.
 */

import { getQdrantManager } from '$lib/server/vector/qdrant-manager.js';
import type { DenseEmbedding, CodebaseVectorName } from '$lib/server/vector/vector-contracts.js';
import { assertDenseEmbedding } from '$lib/server/vector/vector-contracts.js';
import type { Retriever, LaneCandidate, RetrievalInput } from '../lane-contracts.js';
import { validateCandidate } from '../lane-contracts.js';

export interface QdrantDenseRetrieverConfig {
  collection: string;
  vectorName: CodebaseVectorName;
  embedFn: (text: string) => Promise<DenseEmbedding>;
  expectedDimension?: number;
}

/**
 * Normalize raw Qdrant search response to a consistent point array.
 * Qdrant has returned several shapes across API versions:
 *   - Array (direct result array)
 *   - { points: [...] }
 *   - { results: [...] }  (used by some batch endpoints)
 */
export function normalizeQdrantPoints(response: unknown): Array<{
  id: string | number;
  score?: number;
  payload?: Record<string, unknown>;
}> {
  if (Array.isArray(response)) return response;
  const r = response as Record<string, unknown>;
  if (r && Array.isArray(r['points'])) return r['points'] as Array<{ id: string | number; score?: number; payload?: Record<string, unknown> }>;
  if (r && Array.isArray(r['results'])) return r['results'] as Array<{ id: string | number; score?: number; payload?: Record<string, unknown> }>;
  return [];
}

export function createQdrantDenseRetriever(config: QdrantDenseRetrieverConfig): Retriever {
  return {
    lane: 'dense' as const,

    async retrieve(input: RetrievalInput): Promise<LaneCandidate[]> {
      const embedding = await config.embedFn(input.query);

      const dim = config.expectedDimension ?? embedding.dimension;
      assertDenseEmbedding(embedding, dim);

      const qdrant = getQdrantManager();

      let rawResponse: unknown;
      try {
        rawResponse = await qdrant._denseSearch({
          query: input.query,
          queryVector: embedding.values,
          vectorName: config.vectorName,
          collection: config.collection,
          limit: input.limit,
        });
      } catch (err) {
        console.warn(`[qdrant-dense-retriever] ${config.collection} search failed:`, (err as Error).message);
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
          lane: 'dense',
          metadata: payload,
        };
        const valid = validateCandidate(candidate);
        if (valid) candidates.push(valid);
      }

      return candidates;
    },
  };
}
