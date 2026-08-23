import type { RetrievalCandidate } from '../contracts/retrieval-candidate';

export type RankingFeatures = {
  rrf_score: number;
  graph_score: number;
  semantic_score: number;
  exact_score: number;
  telemetry_score: number;
  recency_score: number;
  validation_score: number;
  provenance_score: number;
};

export function buildRankingFeatures(candidate: RetrievalCandidate): RankingFeatures {
  return {
    rrf_score: candidate.score ?? 0,
    graph_score: 0,
    semantic_score: candidate.lane === 'qdrant_dense' ? 1 : 0,
    exact_score: candidate.lane === 'exact' ? 1 : 0,
    telemetry_score: 0,
    recency_score: 0,
    validation_score: 0,
    provenance_score: candidate.packet_id ? 1 : 0,
  };
}

