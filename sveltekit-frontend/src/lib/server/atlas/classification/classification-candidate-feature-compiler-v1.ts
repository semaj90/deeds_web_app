import type { ClassificationObservationV1 } from './classification-observation-v1.js';

export interface ClassificationCandidateFeaturePatchV1 {
  domain_fit_query?: number;
  process_fit?: number;
  feature_label_confidence?: number;
  classifierAbstained: boolean;
  classifierEntropy: number;
  classificationRevision: string;
  sourceObservationIds: string[];
}

function topProbability(observation: ClassificationObservationV1): number {
  return observation.labels[0]?.probability ?? 0;
}

/**
 * Compile detailed classifier receipts into the *existing* 25-column candidate
 * matrix. No new retrieval lane/vote is created and no matrix-width migration is
 * required. Detailed label distributions remain in ClassificationObservationV1.
 */
export function compileClassificationCandidateFeaturesV1(
  observations: readonly ClassificationObservationV1[],
): ClassificationCandidateFeaturePatchV1 {
  const valid = observations.filter((row) => !row.abstained);
  const domains = valid.filter((row) => row.task === 'domain' || row.task === 'multi_label_domain');
  const process = valid.filter((row) => row.task === 'query_intent' || row.task === 'repair_action' || row.task === 'tool_route');
  const role = valid.filter((row) => row.task === 'code_role' || row.task === 'evidence_role');

  const max = (rows: readonly ClassificationObservationV1[]) =>
    rows.length ? Math.max(...rows.map(topProbability)) : undefined;

  const allConfidence = valid.map(topProbability);
  const avgConfidence = allConfidence.length
    ? allConfidence.reduce((sum, value) => sum + value, 0) / allConfidence.length
    : undefined;
  const avgEntropy = observations.length
    ? observations.reduce((sum, row) => sum + row.normalizedEntropy, 0) / observations.length
    : 1;

  return {
    domain_fit_query: max(domains),
    process_fit: max(process),
    feature_label_confidence: max(role) ?? avgConfidence,
    classifierAbstained: observations.length > 0 && valid.length === 0,
    classifierEntropy: avgEntropy,
    classificationRevision: 'atlas.classification-candidate-feature-compiler.v1',
    sourceObservationIds: [...new Set(observations.map((row) => row.observationId))].sort(),
  };
}
