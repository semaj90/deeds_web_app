import { describe, expect, it } from 'vitest';

import { interpretStructuralParityCorpusV1 } from './structural-parity-corpus-interpretation-v1.js';

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    schema: 'atlas.node-tree-sitter-corpus-parity.v2',
    status: 'CORPUS_PARITY_MISMATCH',
    gates: {
      runtimeAvailable: '2/2',
      sourceBytesFrozen: '2/2',
      nodeSpanSelfValid: '2/2',
      sidecarSpanSelfValid: '2/2',
      namedSymbolCoverage: '2/2',
      semanticKindParity: '2/2',
      exactSpanParity: '1/2',
      fullParity: '1/2',
    },
    mismatchCounts: { EXACT_SPAN_MISMATCH: 1 },
    files: [
      {
        comparison: {
          pairs: [
            {
              exactSpanMatch: true,
              startByteDelta: 0,
              endByteDelta: 0,
              left: { startByte: 10, endByte: 20 },
              right: { startByte: 10, endByte: 20 },
            },
            {
              exactSpanMatch: false,
              startByteDelta: 0,
              endByteDelta: 2,
              left: { startByte: 30, endByte: 40 },
              right: { startByte: 30, endByte: 42 },
            },
          ],
        },
      },
    ],
    ...overrides,
  };
}

describe('StructuralParityCorpusInterpretationV1', () => {
  it('classifies runtime unavailability before parity mismatches', () => {
    const result = interpretStructuralParityCorpusV1(receipt({
      status: 'BLOCKED_RUNTIME_UNAVAILABLE',
      gates: { ...receipt().gates, runtimeAvailable: '1/2' },
    }));
    expect(result.status).toBe('RUNTIME_BLOCKED');
    expect(result.spanCompatibility).toBeNull();
    expect(result.structuralPromotionReviewEligible).toBe(false);
  });

  it('classifies byte/span self-validity failures before semantic interpretation', () => {
    const result = interpretStructuralParityCorpusV1(receipt({
      gates: { ...receipt().gates, sourceBytesFrozen: '1/2', semanticKindParity: '0/2' },
      mismatchCounts: { SEMANTIC_KIND_MISMATCH: 10, LEFT_SPAN_INVALID: 1 },
    }));
    expect(result.status).toBe('BYTE_COORDINATE_BLOCKER');
    expect(result.spanCompatibility).toBeNull();
  });

  it('classifies named-symbol coverage before semantic kind', () => {
    const result = interpretStructuralParityCorpusV1(receipt({
      gates: { ...receipt().gates, namedSymbolCoverage: '1/2', semanticKindParity: '0/2' },
      mismatchCounts: { NAMED_SYMBOL_MISSING_LEFT: 3, SEMANTIC_KIND_MISMATCH: 2 },
    }));
    expect(result.status).toBe('SYMBOL_COVERAGE_BLOCKER');
    expect(result.dominantMismatchClass).toBe('NAMED_SYMBOL_MISSING_LEFT');
  });

  it('classifies UNKNOWN/mismatch taxonomy before exact span policy', () => {
    const result = interpretStructuralParityCorpusV1(receipt({
      gates: { ...receipt().gates, semanticKindParity: '1/2', exactSpanParity: '0/2' },
      mismatchCounts: { SEMANTIC_KIND_UNKNOWN_LEFT: 4, EXACT_SPAN_MISMATCH: 20 },
    }));
    expect(result.status).toBe('SEMANTIC_KIND_BLOCKER');
    expect(result.spanCompatibility).toBeNull();
  });

  it('computes span compatibility only after byte, coverage, and semantic gates pass', () => {
    const result = interpretStructuralParityCorpusV1(receipt());
    expect(result.status).toBe('SPAN_POLICY_DIFFERENCE');
    expect(result.structuralPromotionReviewEligible).toBe(true);
    expect(result.spanCompatibility).toMatchObject({
      comparedPairCount: 2,
      exactPairCount: 1,
      medianAbsStartDeltaBytes: 0,
      medianAbsEndDeltaBytes: 1,
      leftContainsRightCount: 1,
      rightContainsLeftCount: 2,
      compatibleOnlyAfterSemanticGates: true,
    });
    expect(result.spanCompatibility?.medianSpanIoU).toBeCloseTo((1 + 10 / 12) / 2, 8);
    expect(result.spanCompatibility?.minimumSpanIoU).toBeCloseTo(10 / 12, 8);
    expect(result.canonicalOwnerChanged).toBe(false);
    expect(result.chunkBoundaryPolicyChanged).toBe(false);
  });

  it('keeps full parity distinct from span-policy-only mismatch', () => {
    const result = interpretStructuralParityCorpusV1(receipt({
      status: 'CORPUS_PARITY_PROVEN',
      gates: {
        runtimeAvailable: '2/2',
        sourceBytesFrozen: '2/2',
        nodeSpanSelfValid: '2/2',
        sidecarSpanSelfValid: '2/2',
        namedSymbolCoverage: '2/2',
        semanticKindParity: '2/2',
        exactSpanParity: '2/2',
        fullParity: '2/2',
      },
      mismatchCounts: {},
    }));
    expect(result.status).toBe('CORPUS_PARITY_PROVEN');
    expect(result.structuralPromotionReviewEligible).toBe(true);
  });

  it('is deterministic for the same receipt', () => {
    const first = interpretStructuralParityCorpusV1(receipt());
    const second = interpretStructuralParityCorpusV1(receipt());
    expect(first.interpretationChecksum).toBe(second.interpretationChecksum);
  });
});
