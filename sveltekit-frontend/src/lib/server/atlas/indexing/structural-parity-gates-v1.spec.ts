import { describe, expect, it } from 'vitest';
import { compareStructuralObservationsV2 } from './structural-parity-comparator-v2.js';
import { deriveChunkBoundaryParityV1, deriveStructuralObservationParityV1 } from './structural-parity-gates-v1.js';
import type { StructuralObservationV1 } from './structural-observation-v1.js';

const row = (name: string, startByte: number, endByte: number, symbolKind = 'FUNCTION'): StructuralObservationV1 => ({
  schema: 'atlas.structural-observation.v1', provider: 'node-tree-sitter-challenger', rawNodeType: 'function_declaration', rawKind: symbolKind, symbolKind, name, startByte, endByte, spanValid: true, spanContainsName: true, parentRoute: [], parentContext: '',
});

describe('structural parity gates', () => {
  it('promotes structural observation parity independently of chunk boundaries', () => {
    const comparison = compareStructuralObservationsV2([row('run', 0, 20)], [row('run', 2, 22)]);
    const structural = deriveStructuralObservationParityV1(comparison, true);
    const chunks = deriveChunkBoundaryParityV1(comparison);
    expect(structural.status).toBe('PROVEN');
    expect(structural.promotionEligible).toBe(true);
    expect(chunks.status).toBe('MISMATCH');
    expect(chunks.medianStartDeltaBytes).toBe(2);
  });

  it('blocks structural promotion when source bytes are not frozen', () => {
    const comparison = compareStructuralObservationsV2([row('run', 0, 20)], [row('run', 0, 20)]);
    const structural = deriveStructuralObservationParityV1(comparison, false);
    expect(structural.status).toBe('BLOCKED');
    expect(structural.promotionEligible).toBe(false);
  });
});
