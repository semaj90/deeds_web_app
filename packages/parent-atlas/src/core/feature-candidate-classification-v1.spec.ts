import { describe, expect, it } from 'vitest';
import { buildObservationFeatureRegistry } from './observation-feature-compiler.js';
import { retrieveFeatureCandidatesV1 } from './feature-candidate-retrieval-v1.js';
import { classifyFeatureCandidatesV1 } from './feature-candidate-classification-v1.js';

const registry = buildObservationFeatureRegistry({
  registryRevision: 'feature-registry:test:v1',
  definitions: [
    { feature_id: 'ast.function_call', family: 'AST_BINARY', value_kind: 'BINARY', description: 'Function call syntax' },
    { feature_id: 'ast.function_definition', family: 'AST_BINARY', value_kind: 'BINARY', description: 'Function definition syntax' },
  ],
});

describe('feature-candidate-classification-v1', () => {
  it('ranks only retrieved candidates and records calibration lineage', () => {
    const retrieval = retrieveFeatureCandidatesV1({ observationId: 'obs:1', queryText: 'function', registry, retrievalRevision: 'retrieval:v1' });
    const result = classifyFeatureCandidatesV1({
      retrieval, classifierId: 'baseline:feature-logistic', classifierRevision: 'model:v1', calibrationRevision: 'calibration:v1',
      probabilities: new Map([['ast.function_call', 0.8], ['ast.function_definition', 0.6]]),
    });
    expect(result.candidates[0]!.feature_id).toBe('ast.function_call');
    expect(result.candidates[0]!.classifier_rank).toBe(1);
    expect(result.abstained).toBe(false);
    expect(result.canonical_authority).toBe(false);
  });

  it('abstains instead of promoting a low-confidence or empty result', () => {
    const retrieval = retrieveFeatureCandidatesV1({ observationId: 'obs:2', queryText: 'function', registry, retrievalRevision: 'retrieval:v1' });
    const result = classifyFeatureCandidatesV1({ retrieval, classifierId: 'baseline', classifierRevision: 'v1', calibrationRevision: 'v1', probabilities: new Map(), abstainThreshold: 0.7 });
    expect(result.abstained).toBe(true);
    expect(result.abstain_reason).toBe('TOP_PROBABILITY_BELOW_THRESHOLD');
  });
});
