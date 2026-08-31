import { describe, expect, it } from 'vitest';
import { buildObservationFeatureRegistry } from './observation-feature-compiler.js';
import { retrieveFeatureCandidatesV1 } from './feature-candidate-retrieval-v1.js';
import { classifyFeatureCandidatesV1 } from './feature-candidate-classification-v1.js';
import { buildFeaturePromotionEligibilityV1 } from './feature-promotion-eligibility-v1.js';

const registry = buildObservationFeatureRegistry({
  registryRevision: 'feature-registry:test:v1',
  definitions: [{ feature_id: 'ast.function_call', family: 'AST_BINARY', value_kind: 'BINARY', description: 'Function call syntax' }],
});

function classification() {
  return classifyFeatureCandidatesV1({
    retrieval: retrieveFeatureCandidatesV1({ observationId: 'obs:1', queryText: 'function call', registry, retrievalRevision: 'retrieval:v1' }),
    classifierId: 'baseline', classifierRevision: 'model:v1', calibrationRevision: 'calibration:v1',
    probabilities: new Map([['ast.function_call', 0.95]]),
  });
}

describe('feature-promotion-eligibility-v1', () => {
  it('requires exact source-revision-matched evidence before eligibility', () => {
    const result = buildFeaturePromotionEligibilityV1({
      classification: classification(), selectedFeatureId: 'ast.function_call', featureKey: 'ast.function_call',
      sourceRef: 'src/example.ts', sourceRevision: 'sha:1',
      evidence: [{ evidence_id: 'ast:1', evidence_kind: 'ast_grep', source_ref: 'src/example.ts', source_revision: 'sha:1' }],
    });
    expect(result.status).toBe('ELIGIBLE');
    expect(result.evidence_refs).toEqual(['ast:1']);
    expect(result.writes_performed).toBe(false);
  });

  it('blocks mismatched evidence and abstained classification', () => {
    const mismatch = buildFeaturePromotionEligibilityV1({
      classification: classification(), selectedFeatureId: 'ast.function_call', featureKey: 'ast.function_call',
      sourceRef: 'src/example.ts', sourceRevision: 'sha:1',
      evidence: [{ evidence_id: 'ast:2', evidence_kind: 'ast_grep', source_ref: 'src/example.ts', source_revision: 'sha:2' }],
    });
    expect(mismatch.status).toBe('BLOCKED_SOURCE_REVISION_MISMATCH');
    const abstained = buildFeaturePromotionEligibilityV1({
      classification: { ...classification(), abstained: true, abstain_reason: 'manual' },
      selectedFeatureId: 'ast.function_call', featureKey: 'ast.function_call', sourceRef: 'src/example.ts', sourceRevision: 'sha:1', evidence: [],
    });
    expect(abstained.status).toBe('BLOCKED_ABSTAINED');
  });
});
