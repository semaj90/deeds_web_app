import { describe, expect, it } from 'vitest';
import { CandidateHeadBit } from './okf-head-mapping-v1.js';
import { mapOkfClassificationToHeads } from './okf-head-mapping-v1.js';

const classification = {
  schemaVersion: 'atlas.okf.domain-classification.v1' as const,
  classificationId: 'class-1',
  subjectRef: 'packet:83',
  subjectKind: 'symbol' as const,
  domainId: 'error-repair',
  taxonomyRevision: 'okf:1',
  confidence: 0.92,
  evidenceRefs: ['source:1'],
  sourceRevision: 'source:S1',
  producerId: 'okf-classifier',
  producerRevision: 'classifier:1',
  lifecycle: 'OBSERVED' as const,
};

describe('OKF head mapping v1', () => {
  it('maps classification policy to a bounded feature head mask', () => {
    const mapping = mapOkfClassificationToHeads({
      classification,
      policy: {
        schema: 'atlas.okf-head-policy.v1',
        policyRevision: 'policy:1',
        defaultHeads: ['semantic'],
        domainHeads: { 'error-repair': ['semantic', 'structural', 'graph', 'execution'] },
        minimumConfidence: 0.8,
        producerRevision: 'policy-builder:1',
      },
    });
    expect(mapping.headMask).toBe(
      CandidateHeadBit.semantic | CandidateHeadBit.structural | CandidateHeadBit.graph | CandidateHeadBit.execution,
    );
    expect(mapping.canonicalWrites).toBe(false);
  });

  it('rejects superseded or below-threshold classifications', () => {
    const policy = {
      schema: 'atlas.okf-head-policy.v1' as const,
      policyRevision: 'policy:1',
      defaultHeads: ['semantic'] as const,
      domainHeads: {},
      minimumConfidence: 0.8,
      producerRevision: 'policy-builder:1',
    };
    expect(() => mapOkfClassificationToHeads({ classification: { ...classification, confidence: 0.2 }, policy })).toThrow('CONFIDENCE');
    expect(() => mapOkfClassificationToHeads({ classification: { ...classification, lifecycle: 'SUPERSEDED' }, policy })).toThrow('SUPERSEDED');
  });
});
