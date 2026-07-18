import type { RetrievalCandidate } from '../contracts/retrieval-candidate';

export interface CrossEncoderRanker {
  rerank(query: string, candidates: RetrievalCandidate[]): Promise<RetrievalCandidate[]>;
}

export function createNoopCrossEncoderRanker(): CrossEncoderRanker {
  return {
    async rerank(_query: string, candidates: RetrievalCandidate[]): Promise<RetrievalCandidate[]> {
      return candidates;
    },
  };
}

