/**
 * Qdrant BM42 Sparse Retriever Adapter
 *
 * Compatibility wrapper for the historical hashed sparse Qdrant lane.
 * This is not true Qdrant BM42: it uses the legacy FNV-1a/log-TF codec until
 * a separately proven BM42 model owner and collection projection exist.
 *
 * This compatibility adapter is intentionally inert until a real BM42 producer,
 * qualified collection, and identity round trip are admitted.
 *
 * The physical field may retain the historical `bm42` name, but this adapter
 * reports the actual algorithm family so it cannot be mistaken for BM42.
 */

import type { Retriever, LaneCandidate, RetrievalInput } from '../lane-contracts.js';

export interface QdrantBM42RetrieverConfig {
  collection: string;
  /** Historical physical field name; its presence does not prove BM42 semantics. */
  sparseVectorName?: string;
}

export function createQdrantBM42Retriever(_config: QdrantBM42RetrieverConfig): Retriever {
  return {
    lane: 'bm42' as const,

    async retrieve(_input: RetrievalInput): Promise<LaneCandidate[]> {
      return [];
    },
  };
}
