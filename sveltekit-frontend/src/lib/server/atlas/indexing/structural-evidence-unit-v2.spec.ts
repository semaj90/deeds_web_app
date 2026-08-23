import { describe, expect, it } from 'vitest';
import { buildStructuralObservationV2, relateStructuralSpansV1 } from './structural-evidence-unit-v2.js';

const row = (startByte: number, endByte: number, provider: 'NODE_TREE_SITTER' | 'TREESITTER_CHUNKER' = 'NODE_TREE_SITTER') =>
  buildStructuralObservationV2({ provider, sourceRef: 'src/a.ts', sourceRevision: 'sha256:source', providerRevision: 'provider:v1', startByte, endByte, rawKind: 'function_declaration', symbolKind: 'FUNCTION', name: 'run', parentPath: null });

describe('StructuralEvidenceUnitV2', () => {
  it('creates revision-qualified deterministic evidence identity', () => {
    const a = row(10, 20);
    const b = row(10, 20);
    expect(a.evidenceKey).toBe(b.evidenceKey);
    expect(a.evidenceKey).toMatch(/^sha256:/);
  });

  it.each([
    [[10, 20], [10, 20], 'EXACT'], [[0, 30], [10, 20], 'CHUNK_CONTAINS_SYMBOL'],
    [[10, 20], [0, 30], 'SYMBOL_CONTAINS_CHUNK'], [[10, 20], [15, 25], 'OVERLAPS'],
    [[0, 5], [10, 20], 'DISJOINT'],
  ] as const)('classifies %s and %s as %s', (left, right, expected) => {
    expect(relateStructuralSpansV1(row(left[0], left[1]), row(right[0], right[1])).relation).toBe(expected);
  });
});
