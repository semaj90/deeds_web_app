import { describe, expect, it } from 'vitest';
import { buildDomainClassificationV1 } from './domain-classification-v1.js';

describe('DomainClassificationV1', () => {
  it('builds a valid RULES-family classification with no training snapshot', () => {
    const result = buildDomainClassificationV1({
      canonicalId: 'packet:abc123',
      sourceRevision: 'sha256:'.padEnd(71, '0'),
      classifierFamily: 'RULES',
      classifierRevision: 'parent-atlas-domain-taxonomy-v1',
      probabilities: { auth: 0.7, ui: 0.3 },
      predictedDomain: 'auth',
      confidence: 0.72,
      evidenceRefs: ['evidence:path:1'],
    });
    expect(result.schema).toBe('atlas.domain-classification.v1');
    expect(result.trainingSnapshotRevision).toBeUndefined();
  });

  it('rejects a RULES classification that claims a training snapshot (it has none)', () => {
    expect(() =>
      buildDomainClassificationV1({
        canonicalId: 'packet:abc123',
        sourceRevision: 'sha256:'.padEnd(71, '0'),
        classifierFamily: 'RULES',
        classifierRevision: 'v1',
        trainingSnapshotRevision: 'snapshot:v1',
        probabilities: { auth: 1 },
        predictedDomain: 'auth',
        confidence: 1,
        evidenceRefs: [],
      }),
    ).toThrow('RULES_FAMILY_HAS_NO_TRAINING_SNAPSHOT');
  });

  it('requires a training snapshot for NAIVE_BAYES', () => {
    expect(() =>
      buildDomainClassificationV1({
        canonicalId: 'packet:abc123',
        sourceRevision: 'sha256:'.padEnd(71, '0'),
        classifierFamily: 'NAIVE_BAYES',
        classifierRevision: 'sklearn-multinomial-nb-v1',
        probabilities: { auth: 0.6 },
        predictedDomain: 'auth',
        confidence: 0.6,
        evidenceRefs: [],
      }),
    ).toThrow('TRAINED_CLASSIFIER_FAMILY_REQUIRES_TRAINING_SNAPSHOT_REVISION');
  });

  it('builds a valid NAIVE_BAYES classification with a training snapshot', () => {
    expect(() =>
      buildDomainClassificationV1({
        canonicalId: 'packet:abc123',
        sourceRevision: 'sha256:'.padEnd(71, '0'),
        classifierFamily: 'NAIVE_BAYES',
        classifierRevision: 'sklearn-multinomial-nb-v1',
        trainingSnapshotRevision: 'training:2026-09-01',
        probabilities: { auth: 0.6, ui: 0.4 },
        predictedDomain: 'auth',
        confidence: 0.6,
        evidenceRefs: [],
      }),
    ).not.toThrow();
  });

  it('rejects a predictedDomain absent from the probabilities map', () => {
    expect(() =>
      buildDomainClassificationV1({
        canonicalId: 'packet:abc123',
        sourceRevision: 'sha256:'.padEnd(71, '0'),
        classifierFamily: 'RULES',
        classifierRevision: 'v1',
        probabilities: { ui: 1 },
        predictedDomain: 'auth', // not in probabilities
        confidence: 1,
        evidenceRefs: [],
      }),
    ).toThrow('PREDICTED_DOMAIN_MUST_APPEAR_IN_PROBABILITIES_MAP');
  });

  it('allows a null predictedDomain (no confident classification) with an empty probabilities map', () => {
    expect(() =>
      buildDomainClassificationV1({
        canonicalId: 'packet:abc123',
        sourceRevision: 'sha256:'.padEnd(71, '0'),
        classifierFamily: 'RULES',
        classifierRevision: 'v1',
        probabilities: {},
        predictedDomain: null,
        confidence: 0,
        evidenceRefs: [],
      }),
    ).not.toThrow();
  });
});
