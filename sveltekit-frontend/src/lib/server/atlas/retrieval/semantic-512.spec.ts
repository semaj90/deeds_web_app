import { describe, expect, it } from 'vitest';
import {
  l2Normalize512,
  projectEmbeddingGemmaToSemantic512,
  projectEmbeddingGemmaToSemanticMrl512,
} from './semantic-512';

function norm(values: Float32Array): number {
  let sum = 0;
  for (const value of values) sum += value * value;
  return Math.sqrt(sum);
}

describe('semantic_512', () => {
  it('takes the first 512 native EmbeddingGemma dimensions and re-normalizes', () => {
    const native = new Float32Array(768);
    for (let i = 0; i < native.length; i++) native[i] = (i + 1) / 1000;
    const projected = projectEmbeddingGemmaToSemantic512(native);
    expect(projected).toHaveLength(512);
    expect(norm(projected)).toBeCloseTo(1, 6);
    const rawPrefix = native.slice(0, 512);
    const rawNorm = norm(rawPrefix);
    expect(projected[0]).toBeCloseTo(rawPrefix[0] / rawNorm, 7);
    expect(projected[511]).toBeCloseTo(rawPrefix[511] / rawNorm, 7);
  });

  it('rejects a non-768 native source instead of padding it', () => {
    expect(() => projectEmbeddingGemmaToSemantic512(new Float32Array(512))).toThrow(/NATIVE_DIMENSION_MISMATCH/);
  });

  it('keeps the canonical MRL projection numerically identical to the legacy adapter', () => {
    const native = new Float32Array(768);
    native[0] = 3;
    native[511] = 4;
    native[512] = 100;
    expect(Array.from(projectEmbeddingGemmaToSemanticMrl512(native)))
      .toEqual(Array.from(projectEmbeddingGemmaToSemantic512(native)));
  });

  it('rejects zero-norm semantic vectors', () => {
    expect(() => l2Normalize512(new Float32Array(512))).toThrow(/ZERO_OR_INVALID_NORM/);
  });
});
