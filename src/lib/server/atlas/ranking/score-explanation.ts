import type { RetrievalCandidate } from '../contracts/retrieval-candidate';
import { buildRankingFeatures } from './ranking-features';

export function explainScore(candidate: RetrievalCandidate): string {
  const features = buildRankingFeatures(candidate);
  return `rrf=${features.rrf_score.toFixed(3)} semantic=${features.semantic_score} exact=${features.exact_score} provenance=${features.provenance_score}`;
}

