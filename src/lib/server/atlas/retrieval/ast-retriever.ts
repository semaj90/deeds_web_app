import type { RetrievalCandidate } from '../contracts/retrieval-candidate';
import type { QueryAnalysis } from '../contracts/query-analysis';

export interface AstRetriever {
  retrieve(query: QueryAnalysis): Promise<RetrievalCandidate[]>;
}

export function createNoopAstRetriever(): AstRetriever {
  return {
    async retrieve(): Promise<RetrievalCandidate[]> {
      return [];
    },
  };
}

