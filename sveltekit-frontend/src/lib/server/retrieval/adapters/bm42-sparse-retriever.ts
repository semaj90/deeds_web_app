import type { Retriever, LaneCandidate, RetrievalInput } from '../lane-contracts.js';

/**
 * Historical sparse adapter.
 *
 * The filename/lane lineage says BM42, but the historical query representation
 * was a legacy hashed codec, not Qdrant BM42. The lane is deferred and inert.
 */
export function createBm42SparseRetriever(): Retriever {
  return {
    lane: 'sparse' as const,

    async retrieve(_input: RetrievalInput): Promise<LaneCandidate[]> {
      return [];
    },
  };
}
