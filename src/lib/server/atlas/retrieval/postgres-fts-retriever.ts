import type { RetrievalCandidate } from '../contracts/retrieval-candidate';
import type { QueryAnalysis } from '../contracts/query-analysis';

export interface PostgresFtsRetriever {
  retrieve(query: QueryAnalysis): Promise<RetrievalCandidate[]>;
}

export function createNoopPostgresFtsRetriever(): PostgresFtsRetriever {
  return {
    async retrieve(): Promise<RetrievalCandidate[]> {
      return [];
    },
  };
}

