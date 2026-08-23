import { describe, expect, it } from 'vitest';

import {
  classifySpanRelationV1,
  makeStructuralEvidenceKeyV2,
} from './structural-evidence-unit-v2.js';

describe('structural evidence unit v2', () => {
  it.each([
    [{ symbolStart: 10, symbolEnd: 20, chunkStart: 10, chunkEnd: 20 }, 'EXACT'],
    [{ symbolStart: 12, symbolEnd: 18, chunkStart: 10, chunkEnd: 20 }, 'CHUNK_CONTAINS_SYMBOL'],
    [{ symbolStart: 10, symbolEnd: 20, chunkStart: 12, chunkEnd: 18 }, 'SYMBOL_CONTAINS_CHUNK'],
    [{ symbolStart: 10, symbolEnd: 20, chunkStart: 18, chunkEnd: 30 }, 'OVERLAPS'],
    [{ symbolStart: 10, symbolEnd: 20, chunkStart: 20, chunkEnd: 30 }, 'DISJOINT'],
  ] as const)('classifies %o as %s', (input, expected) => {
    expect(classifySpanRelationV1(input)).toBe(expected);
  });

  it('makes revision-qualified deterministic evidence keys', () => {
    const input = {
      provider: 'AST_GREP' as const,
      observationUnit: 'SYMBOL' as const,
      sourceRef: 'src/example.ts',
      sourceRevision: 'sha256:source',
      providerRevision: 'ast-grep@0.40.0',
      byteStart: 10,
      byteEnd: 20,
      semanticKind: 'FUNCTION',
      symbolName: 'load',
    };
    const a = makeStructuralEvidenceKeyV2(input);
    const b = makeStructuralEvidenceKeyV2(input);
    expect(a).toBe(b);
    expect(a).toMatch(/^sev2:[0-9a-f]{64}$/);
    expect(makeStructuralEvidenceKeyV2({ ...input, sourceRevision: 'sha256:changed' })).not.toBe(a);
  });
});
