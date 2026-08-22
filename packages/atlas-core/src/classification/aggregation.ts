/**
 * Phase 2 Step 5: Aggregation
 *
 * Blend lexical, semantic, graph, and external lanes into unified multi-label output.
 * Implements weighted averaging with conflict resolution.
 *
 * July 28, 2026
 */

import { type DomainScore, CANONICAL_DOMAINS } from '../validation/hybrid-semantic-classification.js';

/**
 * Aggregated classification result
 */
export interface AggregatedClassification {
  entityId: string;
  domains: AggregatedDomainScore[];
  confidence: number;  // Average confidence across all domains
  agreementScore: number;  // How well do the 4 lanes agree?
  laneCoverage: Record<string, number>;  // % of lanes that provided scores
  primaryDomain?: string;  // Top-scoring domain if confidence > threshold
}

/**
 * Single domain in aggregated result
 */
export interface AggregatedDomainScore {
  domain: string;
  score: number;  // Weighted average [0, 1]
  confidence: number;  // How consistent were the lanes?
  laneScores: Record<string, number>;  // Per-lane scores for this domain
  laneCoverage: number;  // How many lanes provided a score for this domain
  sources: string[];  // Which lanes contributed
}

/**
 * Aggregation weights for each lane
 * Can be tuned based on empirical performance
 */
export interface AggregationWeights {
  lexical: number;  // 0.25 - fast, deterministic, baseline
  semantic: number;  // 0.35 - dense retrieval, expensive
  graph: number;  // 0.25 - structural, limited coverage
  external: number;  // 0.15 - manual labels, rare
}

/**
 * Default weights: semantic > lexical ≈ graph > external
 */
export const DEFAULT_WEIGHTS: AggregationWeights = {
  lexical: 0.25,
  semantic: 0.35,
  graph: 0.25,
  external: 0.15,
};

/**
 * Aggregate domain scores from multiple lanes
 *
 * Implements weighted averaging with conflict resolution:
 * 1. For each domain, collect scores from all lanes that predicted it
 * 2. Compute weighted average: sum(score * weight) / sum(weight for lanes that predicted)
 * 3. Compute confidence as variance across lane predictions
 * 4. Filter by confidence threshold
 * 5. Sort by aggregated score
 */
export function aggregateClassifications(
  entityId: string,
  lexicalScores: DomainScore[],
  semanticScores: DomainScore[],
  graphScores: DomainScore[],
  externalScores: DomainScore[],
  weights: AggregationWeights = DEFAULT_WEIGHTS,
  confidenceThreshold: number = 0.2
): AggregatedClassification {
  // Build domain map: domain -> { lane -> score }
  const domainMap = new Map<string, Record<string, number>>();

  // Helper to register scores
  const registerScores = (scores: DomainScore[], laneName: string, laneWeight: number) => {
    for (const score of scores) {
      if (!domainMap.has(score.domain)) {
        domainMap.set(score.domain, {});
      }
      domainMap.get(score.domain)![laneName] = score.score;
    }
  };

  registerScores(lexicalScores, 'lexical', weights.lexical);
  registerScores(semanticScores, 'semantic', weights.semantic);
  registerScores(graphScores, 'graph', weights.graph);
  registerScores(externalScores, 'external', weights.external);

  // Compute aggregated scores
  const aggregatedDomains: AggregatedDomainScore[] = [];

  for (const [domain, laneScores] of domainMap.entries()) {
    const lanes = Object.entries(laneScores);
    const sources = lanes.map(([lane]) => lane);

    // Weighted average
    let weightedSum = 0;
    let weightSum = 0;

    for (const [lane, score] of lanes) {
      const weight = weights[lane as keyof AggregationWeights] || 0;
      weightedSum += score * weight;
      weightSum += weight;
    }

    const aggregatedScore = weightSum > 0 ? weightedSum / weightSum : 0;

    // Confidence: inverse of variance
    // High agreement (low variance) -> high confidence
    // Low agreement (high variance) -> low confidence
    const mean = aggregatedScore;
    const variance =
      lanes.length > 1
        ? lanes.reduce((sum, [, score]) => sum + Math.pow(score - mean, 2), 0) / lanes.length
        : 0;
    const confidence = Math.max(0, 1 - variance);

    const laneCoverage = lanes.length / 4;  // 4 total lanes

    aggregatedDomains.push({
      domain,
      score: aggregatedScore,
      confidence,
      laneScores: Object.fromEntries(lanes),
      laneCoverage,
      sources,
    });
  }

  // Sort by score descending
  aggregatedDomains.sort((a, b) => b.score - a.score);

  // Filter by confidence threshold
  const filteredDomains = aggregatedDomains.filter((d) => d.score >= confidenceThreshold);

  // Compute overall metrics
  const overallConfidence =
    filteredDomains.length > 0
      ? filteredDomains.reduce((sum, d) => sum + d.score, 0) / filteredDomains.length
      : 0;

  const laneCoverageMap: Record<string, number> = {
    lexical: lexicalScores.length > 0 ? 1 : 0,
    semantic: semanticScores.length > 0 ? 1 : 0,
    graph: graphScores.length > 0 ? 1 : 0,
    external: externalScores.length > 0 ? 1 : 0,
  };

  const agreementScore =
    filteredDomains.length > 0
      ? filteredDomains.reduce((sum, d) => sum + d.confidence, 0) / filteredDomains.length
      : 0;

  const primaryDomain = filteredDomains.length > 0 ? filteredDomains[0].domain : undefined;

  return {
    entityId,
    domains: filteredDomains,
    confidence: overallConfidence,
    agreementScore,
    laneCoverage: laneCoverageMap,
    primaryDomain,
  };
}

/**
 * Aggregate classifications for multiple entities
 */
export function aggregateBatch(
  classifications: Array<{
    entityId: string;
    lexical: DomainScore[];
    semantic: DomainScore[];
    graph: DomainScore[];
    external: DomainScore[];
  }>,
  weights: AggregationWeights = DEFAULT_WEIGHTS,
  confidenceThreshold: number = 0.2
): Record<string, AggregatedClassification> {
  const results: Record<string, AggregatedClassification> = {};

  for (const classification of classifications) {
    results[classification.entityId] = aggregateClassifications(
      classification.entityId,
      classification.lexical,
      classification.semantic,
      classification.graph,
      classification.external,
      weights,
      confidenceThreshold
    );
  }

  return results;
}

/**
 * Aggregation metrics
 */
export interface AggregationMetrics {
  totalEntities: number;
  classifiedEntities: number;
  coveragePercentage: number;
  averageConfidence: number;
  averageAgreement: number;
  minConfidenceObserved: number;
  maxConfidenceObserved: number;
  confidenceVariance: number;
  averagePrimaryDomainConfidence: number;
  avgDomainsPerEntity: number;
  avgLaneCoverage: number;
  conflictPercentage: number;  // Entities where lanes disagree
}

/**
 * Compute metrics from aggregated classifications
 */
export function computeAggregationMetrics(
  aggregatedResults: Record<string, AggregatedClassification>
): AggregationMetrics {
  const totalEntities = Object.keys(aggregatedResults).length;
  const classifiedEntities = Object.values(aggregatedResults).filter((r) => r.domains.length > 0).length;

  const allConfidences = Object.values(aggregatedResults)
    .filter((r) => r.domains.length > 0)
    .map((r) => r.confidence);

  const allAgreements = Object.values(aggregatedResults)
    .filter((r) => r.domains.length > 0)
    .map((r) => r.agreementScore);

  const primaryDomainConfidences = Object.values(aggregatedResults)
    .filter((r) => r.primaryDomain)
    .map((r) => r.domains[0]?.score || 0);

  const domainCounts = Object.values(aggregatedResults)
    .filter((r) => r.domains.length > 0)
    .map((r) => r.domains.length);

  const laneCoverages = Object.values(aggregatedResults)
    .filter((r) => r.domains.length > 0)
    .map((r) => Object.values(r.laneCoverage).filter((v) => v > 0).length / 4);

  const conflictCount = Object.values(aggregatedResults).filter((r) => {
    // Conflict = entity with >1 domain AND lane disagreement
    if (r.domains.length <= 1) return false;
    return r.agreementScore < 0.7;  // Arbitrary threshold for "disagreement"
  }).length;

  const minConfidence = allConfidences.length > 0 ? Math.min(...allConfidences) : 0;
  const maxConfidence = allConfidences.length > 0 ? Math.max(...allConfidences) : 0;
  const avgConfidence = allConfidences.length > 0 ? allConfidences.reduce((a, b) => a + b) / allConfidences.length : 0;

  let variance = 0;
  if (allConfidences.length > 1) {
    variance =
      allConfidences.reduce((sum, c) => sum + Math.pow(c - avgConfidence, 2), 0) /
      (allConfidences.length - 1);
  }

  return {
    totalEntities,
    classifiedEntities,
    coveragePercentage: totalEntities > 0 ? (classifiedEntities / totalEntities) * 100 : 0,
    averageConfidence: avgConfidence,
    averageAgreement: allAgreements.length > 0 ? allAgreements.reduce((a, b) => a + b) / allAgreements.length : 0,
    minConfidenceObserved: minConfidence,
    maxConfidenceObserved: maxConfidence,
    confidenceVariance: variance,
    averagePrimaryDomainConfidence:
      primaryDomainConfidences.length > 0
        ? primaryDomainConfidences.reduce((a, b) => a + b) / primaryDomainConfidences.length
        : 0,
    avgDomainsPerEntity: domainCounts.length > 0 ? domainCounts.reduce((a, b) => a + b) / domainCounts.length : 0,
    avgLaneCoverage: laneCoverages.length > 0 ? laneCoverages.reduce((a, b) => a + b) / laneCoverages.length : 0,
    conflictPercentage:
      classifiedEntities > 0 ? (conflictCount / classifiedEntities) * 100 : 0,
  };
}
