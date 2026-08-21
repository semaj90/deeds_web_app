import {
  AtlasRecommendationV1Schema,
  type AtlasRecommendationV1,
} from '../contracts/semantic-signal-v1.js';
import {
  RecommendationEvidenceV1Schema,
  type RecommendationEvidenceV1,
} from './atlas-learning-recommendation-v1.js';

export const RECOMMENDATION_EVIDENCE_ADAPTER_REVISION = 'atlas.recommendation-evidence-adapter.v1' as const;

export function compileEvidenceBackedRecommendationV1(input: {
  evidence: RecommendationEvidenceV1;
  producer: string;
  producerRevision: string;
  problem: string;
  proposedAction: string;
  validationCriteria: readonly string[];
  rollbackSteps: readonly string[];
}): AtlasRecommendationV1 {
  const evidence = RecommendationEvidenceV1Schema.parse(input.evidence);
  if (!input.validationCriteria.length) throw new Error('ATLAS_RECOMMENDATION_VALIDATION_CRITERIA_REQUIRED');
  if (!input.rollbackSteps.length) throw new Error('ATLAS_RECOMMENDATION_ROLLBACK_REQUIRED');

  return AtlasRecommendationV1Schema.parse({
    schema_version: 'atlas.recommendation.v1',
    signal_type: 'recommendation',
    recommendation_id: evidence.recommendationId,
    subject_id: evidence.subjectCanonicalId,
    workspace_revision: evidence.workspaceRevision,
    producer: input.producer,
    producer_revision: input.producerRevision,
    problem: input.problem,
    proposed_action: input.proposedAction,
    evidence_refs: evidence.supportingEvidenceRefs.map((ref) => ({
      source_ref: ref.evidenceRef,
      evidence_kind: ref.evidenceKind,
      note: `${ref.producerId}@${ref.producerRevision}`,
    })),
    inference_confidence: evidence.inferenceConfidence,
    validation_plan: {
      criteria: [...input.validationCriteria],
      rollback: [...input.rollbackSteps],
    },
    lifecycle_state: 'PROPOSED',
    created_at: new Date().toISOString(),
  });
}
