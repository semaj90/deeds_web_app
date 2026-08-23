import type { RetrievalCandidate } from '../contracts/retrieval-candidate';
import type { QueryAnalysis } from '../contracts/query-analysis';

export interface QdrantDenseRetriever {
  retrieve(query: QueryAnalysis): Promise<RetrievalCandidate[]>;
}

export function createNoopQdrantDenseRetriever(): QdrantDenseRetriever {
  return {
    async retrieve(): Promise<RetrievalCandidate[]> {
      return [];
    },
  };
}

