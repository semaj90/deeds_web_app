import { describe, expect, it } from 'vitest';
import { compileEvidenceBackedRecommendationV1 } from './recommendation-evidence-adapter-v1.js';

const evidence = {
  schema: 'atlas.recommendation-evidence.v1' as const,
  recommendationId: 'rec-1',
  subjectCanonicalId: 'canonical-a',
  workspaceRevision: 'workspace-742',
  sourceRevision: 'source-r1',
  representationRevision: 'semantic-512-r1',
  featureRevision: 'feature-r1',
  revisions: {
    schemaRevision: 'okf-schema-r1',
    taxonomyRevision: 'okf-taxonomy-r1',
    classifierRevision: 'classifier-r1',
    featureMappingRevision: 'feature-map-r1',
  },
  relatedFiles: [],
  supportingReceiptRefs: ['receipt:retrieval:1'],
  supportingEvidenceRefs: [{
    evidenceRef: 'src/search-runtime.ts',
    evidenceKind: 'EXECUTION' as const,
    producerId: 'search-runtime',
    producerRevision: 'r1',
  }],
  priorSuccessfulExecutionRefs: ['receipt:execution:1'],
  inferenceConfidence: 0.87,
  evidenceAuthority: false as const,
  mutationAuthorized: false as const,
  canonicalWritesAllowed: false as const,
};

describe('recommendation evidence adapter', () => {
  it('compiles into the existing AtlasRecommendationV1 owner', () => {
    const recommendation = compileEvidenceBackedRecommendationV1({
      evidence,
      producer: 'parent-atlas',
      producerRevision: 'parent-atlas-r1',
      problem: 'Candidate retrieval misses a related file.',
      proposedAction: 'Review search-runtime.ts with the typed related-file evidence.',
      validationCriteria: ['targeted retrieval fixture passes'],
      rollbackSteps: ['revert routing recommendation change'],
    });
    expect(recommendation.schema_version).toBe('atlas.recommendation.v1');
    expect(recommendation.recommendation_id).toBe('rec-1');
    expect(recommendation.lifecycle_state).toBe('PROPOSED');
    expect(recommendation.evidence_refs[0].evidence_kind).toBe('EXECUTION');
  });

  it('requires validation and rollback plans', () => {
    expect(() => compileEvidenceBackedRecommendationV1({
      evidence,
      producer: 'parent-atlas',
      producerRevision: 'parent-atlas-r1',
      problem: 'x',
      proposedAction: 'y',
      validationCriteria: [],
      rollbackSteps: ['rollback'],
    })).toThrow(/VALIDATION_CRITERIA_REQUIRED/);
  });
});
