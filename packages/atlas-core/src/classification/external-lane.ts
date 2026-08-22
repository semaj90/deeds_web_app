/**
 * External Validation Lane
 *
 * Domain classification via manual labels stored in external systems.
 * Used for ground truth validation and explicit operator-provided classifications.
 *
 * Phase 2 Step 4: July 28, 2026
 */

import { domainScoreSchema, type DomainScore, CANONICAL_DOMAINS } from '../validation/hybrid-semantic-classification.js';

/**
 * Manual label record from external system (Postgres, CouchDB, etc)
 */
export interface ManualLabel {
  entityId: string;
  domain: string;
  confidence: number;  // [0, 1], operator confidence in this label
  source: string;      // e.g., "operator", "code-review", "audit", "external-api"
  timestamp: Date;
  explanation?: string;
}

/**
 * External validation result
 */
export interface ExternalValidationResult {
  entityId: string;
  labels: ManualLabel[];
  agreementScore?: number;  // If multi-label, how consistent are they?
  dominantDomain?: string;  // Most confident label
}

/**
 * Classify entity based on explicit manual labels
 *
 * Returns domain scores sorted by confidence, filtered by threshold
 */
export function classifyExternalSingle(
  entityId: string,
  labels: ManualLabel[],
  confidenceThreshold: number = 0.5
): DomainScore[] {
  if (labels.length === 0) {
    return [];
  }

  // Group by domain to handle multi-label conflicts
  const domainMap = new Map<string, ManualLabel[]>();

  for (const label of labels) {
    if (!domainMap.has(label.domain)) {
      domainMap.set(label.domain, []);
    }
    domainMap.get(label.domain)!.push(label);
  }

  // Convert to DomainScore, averaging confidence per domain
  const scores: DomainScore[] = Array.from(domainMap.entries())
    .map(([domain, domainLabels]) => {
      const avgConfidence = domainLabels.reduce((sum, l) => sum + l.confidence, 0) / domainLabels.length;
      const mostRecentLabel = domainLabels.reduce((prev, curr) =>
        curr.timestamp > prev.timestamp ? curr : prev
      );

      return {
        domain,
        score: avgConfidence,
        source: 'EXTERNAL_LABEL' as const,
        explanation: `Manual label from ${mostRecentLabel.source}: ${mostRecentLabel.explanation || '(no details)'}`,
      };
    })
    .filter((s) => s.score >= confidenceThreshold)
    .sort((a, b) => b.score - a.score);

  return scores;
}

/**
 * Classify multiple entities using external labels
 */
export function classifyExternalBatch(
  entities: Array<{ entityId: string; labels: ManualLabel[] }>,
  confidenceThreshold: number = 0.5
): Record<string, DomainScore[]> {
  const results: Record<string, DomainScore[]> = {};

  for (const entity of entities) {
    results[entity.entityId] = classifyExternalSingle(entity.entityId, entity.labels, confidenceThreshold);
  }

  return results;
}

/**
 * Compute agreement score for multi-label entity
 *
 * Returns [0, 1] indicating consistency:
 * - 1.0: perfect agreement (single domain, or all labels identical)
 * - 0.5: moderate disagreement (50% overlap)
 * - 0.0: complete disagreement (all different domains)
 */
export function computeAgreementScore(labels: ManualLabel[]): number {
  if (labels.length <= 1) return 1.0;

  // Count unique domains
  const uniqueDomains = new Set(labels.map((l) => l.domain));

  // Jaccard similarity-inspired metric
  // If all labels same domain: agreement = 1.0
  // If all different domains: agreement = 0.0
  const diversityIndex = uniqueDomains.size / labels.length;

  // Invert: low diversity = high agreement
  return Math.max(0, 1 - diversityIndex);
}

/**
 * Compute metrics from external classifications
 */
export interface ExternalLaneMetrics {
  totalEntities: number;
  labeledEntities: number;
  coveragePercentage: number;
  averageConfidence: number;
  minConfidenceObserved: number;
  maxConfidenceObserved: number;
  confidenceVariance: number;
  averageAgreementScore: number;
  labelSourceDistribution: Record<string, number>;  // source -> count
  multiLabelPercentage: number;  // % of entities with >1 domain label
}

export function computeExternalMetrics(
  classifications: Record<string, DomainScore[]>,
  externalResults?: Record<string, ExternalValidationResult>
): ExternalLaneMetrics {
  const totalEntities = Object.keys(classifications).length;
  const labeledEntities = Object.values(classifications).filter((scores) => scores.length > 0).length;

  const allScores = Object.values(classifications).flat().map((s) => s.score);

  const minConfidence = allScores.length > 0 ? Math.min(...allScores) : 0;
  const maxConfidence = allScores.length > 0 ? Math.max(...allScores) : 0;
  const avgConfidence = allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0;

  let variance = 0;
  if (allScores.length > 1) {
    variance =
      allScores.reduce((sum, s) => sum + Math.pow(s - avgConfidence, 2), 0) / (allScores.length - 1);
  }

  // Compute agreement scores and label distribution
  let totalAgreement = 0;
  let agreementCount = 0;
  const sourceDistribution: Record<string, number> = {};
  let multiLabelCount = 0;

  if (externalResults) {
    for (const result of Object.values(externalResults)) {
      if (result.labels.length > 0) {
        const agreement = computeAgreementScore(result.labels);
        totalAgreement += agreement;
        agreementCount++;

        // Count multi-label entities
        const uniqueDomains = new Set(result.labels.map((l) => l.domain));
        if (uniqueDomains.size > 1) {
          multiLabelCount++;
        }

        // Track sources
        for (const label of result.labels) {
          sourceDistribution[label.source] = (sourceDistribution[label.source] || 0) + 1;
        }
      }
    }
  }

  const averageAgreement = agreementCount > 0 ? totalAgreement / agreementCount : 0;
  const multiLabelPercentage =
    externalResults && Object.keys(externalResults).length > 0
      ? (multiLabelCount / Object.keys(externalResults).length) * 100
      : 0;

  return {
    totalEntities,
    labeledEntities,
    coveragePercentage: totalEntities > 0 ? (labeledEntities / totalEntities) * 100 : 0,
    averageConfidence: avgConfidence,
    minConfidenceObserved: minConfidence,
    maxConfidenceObserved: maxConfidence,
    confidenceVariance: variance,
    averageAgreementScore: averageAgreement,
    labelSourceDistribution: sourceDistribution,
    multiLabelPercentage,
  };
}

