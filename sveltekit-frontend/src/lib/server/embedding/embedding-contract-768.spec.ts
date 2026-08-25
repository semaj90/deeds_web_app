import { describe, expect, it } from 'vitest';
import {
  deriveEmbeddingGemmaMrlProjection,
  digestEmbeddingGemmaMrl,
  EMBEDDINGGEMMA_MRL_DIMENSIONS,
  formatEmbeddingGemmaInput,
  truncateEmbeddingGemmaMrl,
} from './embedding-contract-768.js';

describe('EmbeddingGemma MRL contract', () => {
  it('supports only the official 768/512/256/128 dimensions', () => {
    expect(EMBEDDINGGEMMA_MRL_DIMENSIONS).toEqual([768, 512, 256, 128]);
    expect(() => truncateEmbeddingGemmaMrl(new Array(768).fill(1), 384 as never)).toThrow(
      'UNSUPPORTED_EMBEDDINGGEMMA_MRL_DIMENSION',
    );
  });

  it.each([768, 512, 256, 128] as const)('returns a normalized %d-dim prefix', (dimension) => {
    const source = Array.from({ length: 768 }, (_, index) => index + 1);
    const result = truncateEmbeddingGemmaMrl(source, dimension);
    const norm = Math.sqrt(result.reduce((sum, value) => sum + value * value, 0));

    expect(result).toHaveLength(dimension);
    expect(norm).toBeCloseTo(1, 5);
  });

  it('rejects non-finite and zero-norm canonical vectors', () => {
    expect(() => truncateEmbeddingGemmaMrl(Array(768).fill(0), 256)).toThrow(
      'SEMANTIC_MRL_ZERO_NORM',
    );
    const invalid = Array(768).fill(1);
    invalid[0] = Number.NaN;
    expect(() => truncateEmbeddingGemmaMrl(invalid, 256)).toThrow('SEMANTIC_MRL_NON_FINITE_VALUE');
  });

  it('owns query and document prompt formatting', () => {
    expect(formatEmbeddingGemmaInput('retrieval_query', '  find the parser owner  ')).toBe(
      'task: search result | query: find the parser owner',
    );
    expect(formatEmbeddingGemmaInput('code_query', 'where is Graphify wired')).toBe(
      'task: code retrieval query | query: where is Graphify wired',
    );
    expect(formatEmbeddingGemmaInput('document', 'function body', '  parser.ts  ')).toBe(
      'title: parser.ts | text: function body',
    );
    expect(() => formatEmbeddingGemmaInput('document', '   ')).toThrow(
      'EMBEDDINGGEMMA_EMPTY_INPUT',
    );
  });

  it('EG-GGUF-5: derives a deterministic digest per MRL projection', () => {
    const source = Array.from({ length: 768 }, (_, index) => index + 1);

    for (const dimension of EMBEDDINGGEMMA_MRL_DIMENSIONS) {
      const projection = deriveEmbeddingGemmaMrlProjection(source, dimension);
      expect(projection.dimension).toBe(dimension);
      expect(projection.vector).toHaveLength(dimension);
      expect(projection.digest).toHaveLength(64);
      expect(projection.digest).toBe(digestEmbeddingGemmaMrl(projection.vector));
    }
  });

  it('EG-GGUF-5: digests differ across MRL dimensions for the same source vector (distinct representations)', () => {
    const source = Array.from({ length: 768 }, (_, index) => index + 1);
    const digests = EMBEDDINGGEMMA_MRL_DIMENSIONS.map(
      (dimension) => deriveEmbeddingGemmaMrlProjection(source, dimension).digest,
    );
    expect(new Set(digests).size).toBe(digests.length);
  });

  it('EG-GGUF-5: digest is stable for identical input and changes when the vector changes', () => {
    const source = Array.from({ length: 768 }, (_, index) => index + 1);
    const a = deriveEmbeddingGemmaMrlProjection(source, 256).digest;
    const b = deriveEmbeddingGemmaMrlProjection(source, 256).digest;
    expect(a).toBe(b);

    const mutated = [...source];
    mutated[0] = 999;
    const c = deriveEmbeddingGemmaMrlProjection(mutated, 256).digest;
    expect(c).not.toBe(a);
  });

  it('EG-GGUF-5: digestEmbeddingGemmaMrl rejects non-finite values', () => {
    expect(() => digestEmbeddingGemmaMrl([1, 2, Number.NaN])).toThrow(
      'SEMANTIC_MRL_DIGEST_NON_FINITE_VALUE',
    );
  });
});
