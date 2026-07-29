import { describe, expect, it } from 'vitest';
import { isValidMaterializerEmbedding } from './ace-materializer.js';

describe('isValidMaterializerEmbedding', () => {
  it('rejects synthetic or undersized vectors', () => {
    expect(isValidMaterializerEmbedding([])).toBe(false);
    expect(isValidMaterializerEmbedding(new Array(768).fill(0))).toBe(false);
    expect(isValidMaterializerEmbedding(new Array(768).fill(0).map((v, i) => (i === 0 ? Number.NaN : v)))).toBe(false);
  });
});
