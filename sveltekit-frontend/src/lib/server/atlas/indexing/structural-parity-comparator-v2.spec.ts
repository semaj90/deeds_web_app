import { describe, expect, it } from 'vitest';

import type { StructuralObservationV1 } from './structural-observation-v1.js';
import { compareStructuralObservationsV2 } from './structural-parity-comparator-v2.js';

function row(overrides: Partial<StructuralObservationV1> & Pick<StructuralObservationV1, 'name' | 'startByte' | 'endByte'>): StructuralObservationV1 {
  return {
    schema: 'atlas.structural-observation.v1',
    provider: 'test',
    rawNodeType: 'variable_declarator',
    rawKind: 'FUNCTION',
    symbolKind: 'FUNCTION',
    spanValid: true,
    spanContainsName: true,
    parentRoute: ['program'],
    parentContext: 'lexical_declaration',
    ...overrides,
  };
}

describe('compareStructuralObservationsV2', () => {
  it('matches duplicate names one-to-one instead of reusing one peer', () => {
    const left = [
      row({ name: 'load', startByte: 10, endByte: 30 }),
      row({ name: 'load', startByte: 100, endByte: 130 }),
    ];
    const right = [
      row({ name: 'load', startByte: 100, endByte: 130 }),
      row({ name: 'load', startByte: 10, endByte: 30 }),
    ];

    const result = compareStructuralObservationsV2(left, right);
    expect(result.pairedCount).toBe(2);
    expect(result.unmatchedLeft).toHaveLength(0);
    expect(result.unmatchedRight).toHaveLength(0);
    expect(result.gates.exactSpanParity).toBe(true);
    expect(result.pairs.map((pair) => pair.startByteDelta)).toEqual([0, 0]);
  });

  it('does not treat UNKNOWN kinds as semantic parity', () => {
    const result = compareStructuralObservationsV2(
      [row({ name: 'alpha', startByte: 0, endByte: 10, rawKind: 'fragment', rawNodeType: 'fragment', symbolKind: 'UNKNOWN' })],
      [row({ name: 'alpha', startByte: 0, endByte: 10, rawKind: 'fragment', rawNodeType: 'fragment', symbolKind: 'UNKNOWN' })],
    );

    expect(result.gates.namedSymbolCoverage).toBe(true);
    expect(result.gates.exactSpanParity).toBe(true);
    expect(result.gates.semanticKindParity).toBe(false);
    expect(result.mismatchCounts.SEMANTIC_KIND_UNKNOWN_BOTH).toBe(1);
  });

  it('reports missing symbols independently from kind/span mismatches', () => {
    const result = compareStructuralObservationsV2(
      [row({ name: 'alpha', startByte: 0, endByte: 10 })],
      [row({ name: 'beta', startByte: 0, endByte: 10 })],
    );

    expect(result.gates.namedSymbolCoverage).toBe(false);
    expect(result.mismatchCounts.NAMED_SYMBOL_MISSING_RIGHT).toBe(1);
    expect(result.mismatchCounts.NAMED_SYMBOL_MISSING_LEFT).toBe(1);
  });

  it('reports exact span drift without hiding a successful semantic match', () => {
    const result = compareStructuralObservationsV2(
      [row({ name: 'alpha', startByte: 10, endByte: 20 })],
      [row({ name: 'alpha', startByte: 12, endByte: 22 })],
    );

    expect(result.gates.namedSymbolCoverage).toBe(true);
    expect(result.gates.semanticKindParity).toBe(true);
    expect(result.gates.exactSpanParity).toBe(false);
    expect(result.mismatchCounts.EXACT_SPAN_MISMATCH).toBe(1);
    expect(result.pairs[0]?.startByteDelta).toBe(2);
    expect(result.pairs[0]?.endByteDelta).toBe(2);
    expect(result.pairs[0]?.spanIntersectionBytes).toBe(8);
    expect(result.pairs[0]?.spanUnionBytes).toBe(12);
    expect(result.pairs[0]?.spanIoU).toBeCloseTo(8 / 12);
    expect(result.pairs[0]?.leftContainsRight).toBe(false);
    expect(result.pairs[0]?.rightContainsLeft).toBe(false);
  });

  it('does not treat anonymous functions or quoted module labels as symbols', () => {
    const result = compareStructuralObservationsV2(
      [row({ name: 'alpha', startByte: 0, endByte: 10 })],
      [
        row({ name: '<anonymous>', startByte: 0, endByte: 10, symbolKind: 'FUNCTION' }),
        row({ name: "'module-name'", startByte: 20, endByte: 32, symbolKind: 'UNKNOWN' }),
        row({ name: 'alpha', startByte: 0, endByte: 10 }),
      ],
    );

    expect(result.pairedCount).toBe(1);
    expect(result.unmatchedLeft).toHaveLength(0);
    expect(result.unmatchedRight).toHaveLength(0);
    expect(result.gates.namedSymbolCoverage).toBe(true);
  });
});
