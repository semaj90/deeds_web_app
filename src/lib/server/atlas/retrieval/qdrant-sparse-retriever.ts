import type { RetrievalCandidate } from '../contracts/retrieval-candidate';
import type { QueryAnalysis } from '../contracts/query-analysis';

export interface QdrantSparseRetriever {
  retrieve(query: QueryAnalysis): Promise<RetrievalCandidate[]>;
}

export function createNoopQdrantSparseRetriever(): QdrantSparseRetriever {
  return {
    async retrieve(): Promise<RetrievalCandidate[]> {
      return [];
    },
  };
}

