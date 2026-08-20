import { describe, expect, it } from 'vitest';
import {
  canonicalExecutionJson,
  canonicalExecutionSha256,
  canonicalizeExecutionValue,
  executionParameterFingerprint,
} from './canonical-execution-json.js';

describe('canonical execution JSON', () => {
  it('sorts object keys recursively while preserving array order', () => {
    const a = { z: 3, a: { y: 2, x: 1 }, rows: [{ b: 2, a: 1 }, { a: 9, b: 8 }] };
    const b = { rows: [{ a: 1, b: 2 }, { b: 8, a: 9 }], a: { x: 1, y: 2 }, z: 3 };
    expect(canonicalExecutionJson(a)).toBe(canonicalExecutionJson(b));
    expect(canonicalExecutionJson(a)).toBe('{"a":{"x":1,"y":2},"rows":[{"a":1,"b":2},{"a":9,"b":8}],"z":3}');
  });

  it('normalizes negative zero', () => {
    expect(canonicalizeExecutionValue({ v: -0 })).toEqual({ v: 0 });
    expect(canonicalExecutionJson({ v: -0 })).toBe('{"v":0}');
  });

  it('rejects undefined, bigint, functions and non-finite numbers', () => {
    expect(() => canonicalExecutionJson({ value: undefined })).toThrow(/unsupported canonical JSON value undefined/);
    expect(() => canonicalExecutionJson({ value: 1n })).toThrow(/unsupported canonical JSON value bigint/);
    expect(() => canonicalExecutionJson({ value: () => 1 })).toThrow(/unsupported canonical JSON value function/);
    expect(() => canonicalExecutionJson({ value: Number.NaN })).toThrow(/non-finite number/);
    expect(() => canonicalExecutionJson({ value: Infinity })).toThrow(/non-finite number/);
  });

  it('rejects Date/class instances instead of depending on implicit toJSON behavior', () => {
    expect(() => canonicalExecutionJson({ when: new Date('2026-08-18T00:00:00Z') })).toThrow(/plain objects/);
  });

  it('produces identical SHA-256 for semantically identical key orderings', () => {
    expect(canonicalExecutionSha256({ b: 2, a: 1 })).toBe(canonicalExecutionSha256({ a: 1, b: 2 }));
  });

  it('changes execution parameter fingerprints when semantic parameters change', () => {
    const a = executionParameterFingerprint({
      algorithmId: 'CAGRA_KNN',
      representationRevision: 'sem-7',
      implementationRevision: 'cagra-1',
      parameters: { topK: 32, graphDegree: 64 },
    });
    const reordered = executionParameterFingerprint({
      algorithmId: 'CAGRA_KNN',
      representationRevision: 'sem-7',
      implementationRevision: 'cagra-1',
      parameters: { graphDegree: 64, topK: 32 },
    });
    const changed = executionParameterFingerprint({
      algorithmId: 'CAGRA_KNN',
      representationRevision: 'sem-7',
      implementationRevision: 'cagra-1',
      parameters: { graphDegree: 64, topK: 64 },
    });
    expect(a).toBe(reordered);
    expect(changed).not.toBe(a);
  });
});
