import type { RankingFeatures } from './ranking-features';

export function logisticBaselineScore(features: RankingFeatures): number {
  const raw =
    1.6 * features.rrf_score +
    0.8 * features.graph_score +
    0.7 * features.semantic_score +
    0.5 * features.exact_score +
    0.2 * features.telemetry_score +
    0.2 * features.recency_score +
    0.4 * features.validation_score +
    0.3 * features.provenance_score;
  return 1 / (1 + Math.exp(-raw));
}

