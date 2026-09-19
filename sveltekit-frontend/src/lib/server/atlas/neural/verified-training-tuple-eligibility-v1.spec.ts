import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  assertDisjointTrainingSourceRevisionsV1,
  buildVerifiedTrainingTupleEligibilityV1,
} from './verified-training-tuple-eligibility-v1.js';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

const base = {
  tupleId: 'tuple:fixture:1',
  queryChecksum: sha('query'),
  labelChecksum: sha('label'),
  labelKind: 'HUMAN_DECISION' as const,
  sourceRef: 'src/example.ts',
  sourceRevision: sha('source'),
  packetKey: 'packet:example',
  workspaceRevision: sha('workspace'),
  representationId: 'semantic_768',
  representationRevision: 'semantic_768:v1',
  modelRevision: 'ornith:v1',
  adapterRevision: null,
  executionReceiptChecksum: sha('execution'),
  validationReceiptChecksum: sha('validation'),
  executionStatus: 'PROVEN' as const,
  validationStatus: 'PROVEN' as const,
  datasetRevision: 'dataset:fixture:v1',
  split: 'TRAIN' as const,
  groundTruthVerified: true as const,
  generatedTextOnly: false as const,
  offlineOnly: true as const,
  onlineWeightMutationAllowed: false as const,
  canonicalWritesAllowed: false as const,
};

describe('VerifiedTrainingTupleEligibilityV1', () => {
  it('binds tuple identity, lineage, execution, and validation receipts', () => {
    const tuple = buildVerifiedTrainingTupleEligibilityV1(base);
    expect(tuple.schema).toBe('atlas.verified-training-tuple-eligibility.v1');
    expect(tuple.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(tuple.canonicalWritesAllowed).toBe(false);
  });

  it('rejects generated text as the sole ground truth', () => {
    expect(() => buildVerifiedTrainingTupleEligibilityV1({ ...base, generatedTextOnly: true as never })).toThrow(
      'GENERATED_TEXT_CANNOT_BE_SOLE_GROUND_TRUTH',
    );
  });

  it('rejects unverified ground truth', () => {
    expect(() => buildVerifiedTrainingTupleEligibilityV1({ ...base, groundTruthVerified: false as never })).toThrow(
      'TRAINING_GROUND_TRUTH_UNVERIFIED',
    );
  });

  it('keeps training and held-out source revisions disjoint', () => {
    expect(() => assertDisjointTrainingSourceRevisionsV1({
      trainSourceRevisions: ['source:a', 'source:b'],
      heldOutSourceRevisions: ['source:c'],
    })).not.toThrow();
    expect(() => assertDisjointTrainingSourceRevisionsV1({
      trainSourceRevisions: ['source:a'],
      heldOutSourceRevisions: ['source:a'],
    })).toThrow('TRAIN_HELD_OUT_SOURCE_REVISION_OVERLAP');
  });

  it('keeps online weight mutation and canonical writes disabled', () => {
    const tuple = buildVerifiedTrainingTupleEligibilityV1(base);
    expect(tuple.offlineOnly).toBe(true);
    expect(tuple.onlineWeightMutationAllowed).toBe(false);
    expect(tuple.canonicalWritesAllowed).toBe(false);
  });
});
