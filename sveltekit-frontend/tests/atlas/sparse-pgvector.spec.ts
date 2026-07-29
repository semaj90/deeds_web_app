// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseHalfvecText, validateDenseVector } from '../../scripts/atlas/sparse/lib/pgvector-text.mjs';

describe('sparse pgvector helpers', () => {
  it('parses halfvec text and enforces dimension', () => {
    const values = parseHalfvecText('[1, 2, 3]', 3);
    expect(values).toEqual([1, 2, 3]);
  });

  it('rejects malformed or non-finite dense vectors', () => {
    expect(() => parseHalfvecText('1,2,3', 3)).toThrow(/invalid halfvec format/i);
    expect(() => validateDenseVector([1, Number.NaN, 3], 3)).toThrow(/non-finite/i);
  });
});
