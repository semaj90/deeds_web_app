import type { RetrievalCandidate } from '../contracts/retrieval-candidate';
import type { QueryAnalysis } from '../contracts/query-analysis';

export interface ExactRetriever {
  retrieve(query: QueryAnalysis): Promise<RetrievalCandidate[]>;
}

export function createNoopExactRetriever(): ExactRetriever {
  return {
    async retrieve(): Promise<RetrievalCandidate[]> {
      return [];
    },
  };
}

