import { describe, expect, it } from 'vitest';
import {
  digestSemantic768OutputV1,
  validateSemantic768OutputV1,
} from './embedding-runtime-v1.js';
import {
  digestEmbeddingInputV1,
  digestTokenTensorV1,
  estimateEmbeddingTokensV1,
} from './embedding-context-plan-v1.js';

describe('embedding runtime ABI v1', () => {
  it('accepts only finite normalized semantic_768 output', () => {
    const vector = new Float32Array(768).fill(1 / Math.sqrt(768));
    const validated = validateSemantic768OutputV1(vector);
    expect(validated).toHaveLength(768);
    expect(digestSemantic768OutputV1(validated)).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('derives stable input identity and bounded token estimate', () => {
    expect(digestEmbeddingInputV1('  alpha  ')).toBe(digestEmbeddingInputV1('alpha'));
    expect(estimateEmbeddingTokensV1('alpha')).toBeGreaterThan(0);
    expect(digestTokenTensorV1({ tokenizerRevision: 'tok:v1', inputIds: [1, 2], attentionMask: [1, 1] }))
      .toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('rejects a dimension mismatch', () => {
    expect(() => validateSemantic768OutputV1(new Float32Array(767))).toThrow('SEMANTIC_768_OUTPUT_INVALID');
  });
});
