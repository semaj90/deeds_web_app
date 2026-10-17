import { describe, expect, it } from 'vitest';
import {
  type FeatureLabelEvidence,
  createFeatureLabelV1,
  decodeStandardFeatureLabels,
  encodeFeatureLabelBitmask,
  satisfiesFeatureBitmask,
  FEATURE_LABEL_REGISTRY,
} from './feature-label-v1.js';

describe('LABEL-01: Feature-Label Dictionary & Evidence Contract V1', () => {
  const dummySha = 'sha256:' + 'f'.repeat(64);

  const testReceiptEvidence: FeatureLabelEvidence = {
    type: 'test_receipt',
    ref: 'test-run:55#test_validate_packet',
    sourceContentSha256: dummySha,
    metadata: {
      durationMs: 42,
      exitCode: 0,
    },
  };

  const astObservationEvidence: FeatureLabelEvidence = {
    type: 'ast_observation',
    ref: 'treesitter:node:function_declaration:331',
    sourceContentSha256: dummySha,
  };

  it('creates and validates a standard feature label with evidence attachment', () => {
    const label = createFeatureLabelV1({
      canonicalId: 'fixture:symbol:331',
      featureName: 'UNIT_TEST_PASS',
      value: true,
      evidence: testReceiptEvidence,
      status: 'FIXTURE_ONLY',
    });

    expect(label.schema).toBe('atlas.feature-label.v1');
    expect(label.canonicalId).toBe('fixture:symbol:331');
    expect(label.featureId).toBe(4);
    expect(label.featureName).toBe('UNIT_TEST_PASS');
    expect(label.value).toBe(true);
    expect(label.status).toBe('FIXTURE_ONLY');
    expect(label.evidence.type).toBe('test_receipt');
    expect(label.evidence.ref).toBe('test-run:55#test_validate_packet');
  });

  it('rejects custom feature labels lacking an explicit customFeatureId', () => {
    expect(() =>
      createFeatureLabelV1({
        canonicalId: 'fixture:symbol:331',
        featureName: 'CUSTOM_LEGAL_COMPLIANCE',
        value: true,
        evidence: testReceiptEvidence,
      })
    ).toThrow('FEATURE_ID_REQUIRED_FOR_CUSTOM_LABEL');

    const customLabel = createFeatureLabelV1({
      canonicalId: 'fixture:symbol:331',
      featureName: 'CUSTOM_LEGAL_COMPLIANCE',
      value: true,
      evidence: testReceiptEvidence,
      customFeatureId: 99,
    });
    expect(customLabel.featureId).toBe(99);
  });

  it('encodes multiple feature labels into a compact 64-bit integer bitmask', () => {
    const l1 = createFeatureLabelV1({
      canonicalId: 'fixture:symbol:331',
      featureName: 'AST_FUNCTION_DEFINED', // bitShift: 0 (featureId: 1) -> 1n
      value: true,
      evidence: astObservationEvidence,
    });
    const l2 = createFeatureLabelV1({
      canonicalId: 'fixture:symbol:331',
      featureName: 'UNIT_TEST_PASS', // bitShift: 3 (featureId: 4) -> 8n
      value: true,
      evidence: testReceiptEvidence,
    });
    const l3 = createFeatureLabelV1({
      canonicalId: 'fixture:symbol:331',
      featureName: 'SOURCE_LINEAGE_PROVEN', // bitShift: 4 (featureId: 5) -> 16n
      value: true,
      evidence: { type: 'lineage_join', ref: 'pg:atlas_source_refs:101', sourceContentSha256: dummySha },
    });

    const bitmask = encodeFeatureLabelBitmask([l1, l2, l3]);
    // 1n + 8n + 16n = 25n (0b11001)
    expect(bitmask).toBe(25n);

    // Decodes standard labels back
    const decoded = decodeStandardFeatureLabels(bitmask);
    expect(decoded).toContain('AST_FUNCTION_DEFINED');
    expect(decoded).toContain('UNIT_TEST_PASS');
    expect(decoded).toContain('SOURCE_LINEAGE_PROVEN');
    expect(decoded).not.toContain('TYPECHECK_PASS');
  });

  it('excludes REJECTED and false-valued feature labels from bitmasks', () => {
    const lPass = createFeatureLabelV1({
      canonicalId: 'fixture:symbol:331',
      featureName: 'AST_FUNCTION_DEFINED',
      value: true,
      evidence: astObservationEvidence,
    });
    const lFail = createFeatureLabelV1({
      canonicalId: 'fixture:symbol:331',
      featureName: 'TYPECHECK_PASS',
      value: false, // failed
      evidence: { type: 'typecheck_receipt', ref: 'lsp:diagnostic:err', sourceContentSha256: dummySha },
    });
    const lRejected = createFeatureLabelV1({
      canonicalId: 'fixture:symbol:331',
      featureName: 'UNIT_TEST_PASS',
      value: true,
      evidence: testReceiptEvidence,
      status: 'REJECTED', // rejected / invalid receipt
    });

    const bitmask = encodeFeatureLabelBitmask([lPass, lFail, lRejected]);
    expect(bitmask).toBe(1n); // only AST_FUNCTION_DEFINED bit is active
  });

  it('evaluates bitmask satisfaction predicates correctly', () => {
    // Required mask: AST_FUNCTION_DEFINED (1n) | SOURCE_LINEAGE_PROVEN (16n) = 17n
    const requiredMask = (1n << BigInt(FEATURE_LABEL_REGISTRY.AST_FUNCTION_DEFINED.bitShift)) |
                         (1n << BigInt(FEATURE_LABEL_REGISTRY.SOURCE_LINEAGE_PROVEN.bitShift));

    // Candidate 1: has AST, Lineage, and Unit Test -> bitmask 25n
    expect(satisfiesFeatureBitmask(25n, requiredMask)).toBe(true);

    // Candidate 2: has AST and Unit Test only -> bitmask 9n (missing lineage)
    expect(satisfiesFeatureBitmask(9n, requiredMask)).toBe(false);
  });
});
