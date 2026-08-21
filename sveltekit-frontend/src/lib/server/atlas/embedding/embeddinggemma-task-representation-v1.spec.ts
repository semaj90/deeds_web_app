import { describe, expect, it } from 'vitest';

import {
  buildEmbeddingCacheIdentityV1,
  embeddingGemmaTaskRepresentationIdV1,
  encodeClassificationInput,
  encodeCodeRetrievalQuery,
  encodeRetrievalDocument,
  encodeRetrievalQuery,
  projectEmbeddingGemmaMrlV1,
} from './embeddinggemma-task-representation-v1.js';

function nativeVector(): Float32Array {
  const vector = new Float32Array(768);
  for (let index = 0; index < vector.length; index += 1) vector[index] = (index + 1) / 1000;
  return vector;
}

function norm(vector: Float32Array): number {
  let sum = 0;
  for (const value of vector) sum += value * value;
  return Math.sqrt(sum);
}

describe('EmbeddingGemma task representation V1', () => {
  it('formats retrieval, code retrieval, document, and classification tasks distinctly', () => {
    expect(encodeRetrievalQuery('find writer').formattedText).toBe('task: search result | query: find writer');
    expect(encodeCodeRetrievalQuery('find writer').formattedText).toBe('task: code retrieval | query: find writer');
    expect(encodeRetrievalDocument('body', 'Writer').formattedText).toBe('title: Writer | text: body');
    expect(encodeClassificationInput('debug qdrant').formattedText).toBe('task: classification | query: debug qdrant');
  });

  it('keeps task identity separate from dimension', () => {
    expect(embeddingGemmaTaskRepresentationIdV1('classification', 768)).toBe('classification_768');
    expect(embeddingGemmaTaskRepresentationIdV1('classification', 128)).toBe('classification_mrl_128');
    expect(embeddingGemmaTaskRepresentationIdV1('retrieval_query', 512)).toBe('retrieval_query_mrl_512');
    expect(embeddingGemmaTaskRepresentationIdV1('code_retrieval_query', 768)).toBe('code_query_768');
  });

  it('projects 768 to normalized MRL dimensions without changing the native vector', () => {
    const native = nativeVector();
    const originalTail = native[767];
    for (const dimension of [128, 256, 512, 768] as const) {
      const projected = projectEmbeddingGemmaMrlV1(native, dimension);
      expect(projected).toHaveLength(dimension);
      expect(norm(projected)).toBeCloseTo(1, 6);
    }
    expect(native).toHaveLength(768);
    expect(native[767]).toBe(originalTail);
  });

  it('makes prompt/executor/model revisions part of cache identity', () => {
    const base = {
      modelRevision: 'model-r1', artifactChecksum: 'a'.repeat(64), executorRevision: 'llama-r1',
      mode: 'classification' as const, sourceTextDigest: 'b'.repeat(64), representationRevision: 'repr-r1',
      outputDimension: 128 as const,
    };
    const one = buildEmbeddingCacheIdentityV1(base);
    const two = buildEmbeddingCacheIdentityV1({ ...base, executorRevision: 'llama-r2' });
    expect(one).not.toBe(two);
  });
});
