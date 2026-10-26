import { describe, it, expect } from 'vitest';
import {
  ATLAS_RANK_INPUT_SCHEMA_V1,
  ATLAS_RANK_RECEIPT_SCHEMA_V1,
  FEATURES_PER_CANDIDATE,
  MAX_RANK_BATCH_SIZE,
  type AtlasRankInputV1,
  validateAtlasRankInputV1,
  buildAtlasRankScoringReceiptV1,
  scoreAtlasRankInputCpuOracle,
} from './atlas-rank-input-adapter-v1.js';

function createValidInput(batchSize = 3): AtlasRankInputV1 {
  const ordinals = Array.from({ length: batchSize }, (_, i) => i * 10);
  const elements = batchSize * FEATURES_PER_CANDIDATE;
  const features = new Float32Array(elements).fill(0.5);
  const presenceMask = new Uint8Array(elements).fill(1);
  const evidenceRefs = ordinals.map((ord) => ({
    candidateOrdinal: ord,
    evidenceRevision: 'rev-2026-10-18',
    featureProjectionRevision: 'rev-2026-10-18',
    receiptId: `rcpt-${ord}`,
  }));

  return {
    schema: ATLAS_RANK_INPUT_SCHEMA_V1,
    queryDigest: 'sha256:query123',
    producerRevision: 'atlas-scorer-v1',
    candidateSet: {
      sealed: true,
      ordinals,
      setDigest: 'sha256:set123',
    },
    features,
    presenceMask,
    evidenceRefs,
  };
}

describe('AtlasRankInputAdapterV1 (Agent Layer)', () => {
  it('validates a well-formed input cleanly', () => {
    const input = createValidInput(3);
    expect(() => validateAtlasRankInputV1(input)).not.toThrow();
  });

  it('rejects invalid schema', () => {
    const input = {
      ...createValidInput(2),
      schema: 'invalid_schema' as typeof ATLAS_RANK_INPUT_SCHEMA_V1,
    };
    expect(() => validateAtlasRankInputV1(input)).toThrow(/Invalid schema/);
  });

  it('rejects unsealed candidateSet', () => {
    const base = createValidInput(2);
    const input: AtlasRankInputV1 = {
      ...base,
      candidateSet: {
        ...base.candidateSet,
        sealed: false as unknown as true,
      },
    };
    expect(() => validateAtlasRankInputV1(input)).toThrow(/must be explicitly sealed/);
  });

  it('rejects batch size 0 or > MAX_RANK_BATCH_SIZE (256)', () => {
    const emptyInput = {
      ...createValidInput(1),
      candidateSet: { sealed: true as const, ordinals: [], setDigest: 'empty' },
      features: new Float32Array(0),
      presenceMask: new Uint8Array(0),
      evidenceRefs: [],
    };
    expect(() => validateAtlasRankInputV1(emptyInput)).toThrow(/Batch size B=0 out of bounds/);

    const oversizedOrdinals = Array.from({ length: MAX_RANK_BATCH_SIZE + 1 }, (_, i) => i);
    const oversizedInput = {
      ...createValidInput(1),
      candidateSet: { sealed: true as const, ordinals: oversizedOrdinals, setDigest: 'over' },
      features: new Float32Array(oversizedOrdinals.length * FEATURES_PER_CANDIDATE),
      presenceMask: new Uint8Array(oversizedOrdinals.length * FEATURES_PER_CANDIDATE),
      evidenceRefs: oversizedOrdinals.map((ord) => ({
        candidateOrdinal: ord,
        evidenceRevision: 'rev',
        featureProjectionRevision: 'rev',
      })),
    };
    expect(() => validateAtlasRankInputV1(oversizedInput)).toThrow(/out of bounds/);
  });

  it('rejects duplicate or non-integer candidate ordinals', () => {
    const base = createValidInput(2);
    const duplicateInput: AtlasRankInputV1 = {
      ...base,
      candidateSet: {
        sealed: true,
        ordinals: [5, 5],
        setDigest: 'dup',
      },
      evidenceRefs: [
        { candidateOrdinal: 5, evidenceRevision: 'r', featureProjectionRevision: 'r' },
        { candidateOrdinal: 5, evidenceRevision: 'r', featureProjectionRevision: 'r' },
      ],
    };
    expect(() => validateAtlasRankInputV1(duplicateInput)).toThrow(/Duplicate candidate ordinal/);

    const nonIntegerInput: AtlasRankInputV1 = {
      ...base,
      candidateSet: {
        sealed: true,
        ordinals: [1.5, 2],
        setDigest: 'float',
      },
      evidenceRefs: [
        { candidateOrdinal: 1.5, evidenceRevision: 'r', featureProjectionRevision: 'r' },
        { candidateOrdinal: 2, evidenceRevision: 'r', featureProjectionRevision: 'r' },
      ],
    };
    expect(() => validateAtlasRankInputV1(nonIntegerInput)).toThrow(/Invalid candidate ordinal/);
  });

  it('rejects feature tensor length mismatch and non-finite values', () => {
    const base = createValidInput(2);
    const mismatchedFeatures: AtlasRankInputV1 = {
      ...base,
      features: new Float32Array(10), // expected 2 * 24 = 48
    };
    expect(() => validateAtlasRankInputV1(mismatchedFeatures)).toThrow(/Feature tensor length mismatch/);

    const nanFeatures: AtlasRankInputV1 = {
      ...base,
      features: new Float32Array(base.features),
    };
    nanFeatures.features[3] = NaN;
    expect(() => validateAtlasRankInputV1(nanFeatures)).toThrow(/Non-finite feature value/);
  });

  it('rejects presence mask length mismatch and non-{0,1} values', () => {
    const base = createValidInput(2);
    const mismatchedMask: AtlasRankInputV1 = {
      ...base,
      presenceMask: new Uint8Array(10),
    };
    expect(() => validateAtlasRankInputV1(mismatchedMask)).toThrow(/Presence mask length mismatch/);

    const invalidValueMask: AtlasRankInputV1 = {
      ...base,
      presenceMask: new Uint8Array(base.presenceMask),
    };
    invalidValueMask.presenceMask[5] = 2;
    expect(() => validateAtlasRankInputV1(invalidValueMask)).toThrow(/must be 0 or 1/);
  });

  it('rejects evidence ordinal mismatch and revision drift', () => {
    const base = createValidInput(2);
    const ordinalMismatch: AtlasRankInputV1 = {
      ...base,
      evidenceRefs: [
        { candidateOrdinal: 999, evidenceRevision: 'r', featureProjectionRevision: 'r' },
        { candidateOrdinal: base.candidateSet.ordinals[1], evidenceRevision: 'r', featureProjectionRevision: 'r' },
      ],
    };
    expect(() => validateAtlasRankInputV1(ordinalMismatch)).toThrow(/Evidence ordinal mismatch/);

    const revisionDrift: AtlasRankInputV1 = {
      ...base,
      evidenceRefs: [
        { candidateOrdinal: base.candidateSet.ordinals[0], evidenceRevision: 'rev-A', featureProjectionRevision: 'rev-B' },
        { candidateOrdinal: base.candidateSet.ordinals[1], evidenceRevision: 'rev-A', featureProjectionRevision: 'rev-A' },
      ],
    };
    expect(() => validateAtlasRankInputV1(revisionDrift)).toThrow(/Revision drift/);
  });

  it('produces a valid AtlasRankScoringReceiptV1 with digests and scores', () => {
    const input = createValidInput(3);
    const scores = [0.95, 0.42, 0.77];
    const receipt = buildAtlasRankScoringReceiptV1(input, scores, 'cutile_sm86');

    expect(receipt.schema).toBe(ATLAS_RANK_RECEIPT_SCHEMA_V1);
    expect(receipt.batchSize).toBe(3);
    expect(receipt.computeBackend).toBe('cutile_sm86');
    expect(receipt.scores).toEqual([0.95, 0.42, 0.77]);
    expect(receipt.candidateOrderDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.featureTensorChecksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('evaluates deterministic CPU oracle scores with default weights', () => {
    const input = createValidInput(2);
    const receipt = scoreAtlasRankInputCpuOracle(input);

    expect(receipt.schema).toBe(ATLAS_RANK_RECEIPT_SCHEMA_V1);
    expect(receipt.computeBackend).toBe('cpu_oracle');
    expect(receipt.batchSize).toBe(2);
    expect(receipt.scores.length).toBe(2);
    expect(receipt.scores[0]).toBeCloseTo(receipt.scores[1], 5);
    expect(receipt.candidateOrderDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.featureTensorChecksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('respects zero presence mask and custom weights in CPU oracle', () => {
    const input = createValidInput(1);
    // Mask out all features except index 0
    input.presenceMask.fill(0);
    input.presenceMask[0] = 1;
    input.features[0] = 2.0;

    const customWeights = new Float32Array(FEATURES_PER_CANDIDATE).fill(0);
    customWeights[0] = 1.5;

    const receipt = scoreAtlasRankInputCpuOracle(input, customWeights);
    expect(receipt.scores[0]).toBeCloseTo(3.0, 5);

    // Mismatched custom weights length throws
    expect(() => scoreAtlasRankInputCpuOracle(input, [1, 2, 3])).toThrow(/Oracle weights length mismatch/);
  });
});

