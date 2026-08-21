import { describe, expect, it } from 'vitest';
import {
  buildEmbeddingGemmaCacheIdentity,
  encodeClassificationQuery,
  encodeCodeRetrievalQuery,
  encodeRetrievalDocument,
  encodeRetrievalQuery,
  EMBEDDINGGEMMA_MAX_CONTEXT_TOKENS,
  EMBEDDINGGEMMA_NATIVE_DIMENSION,
} from './embeddinggemma-prompt-contract.js';

describe('EmbeddingGemma prompt authority', () => {
  it('formats retrieval queries exactly', () => {
    const value = encodeRetrievalQuery('find the packet writer');
    expect(value.formattedText).toBe('task: search result | query: find the packet writer');
    expect(value.mode).toBe('RETRIEVAL_QUERY');
    expect(value.nativeDimension).toBe(EMBEDDINGGEMMA_NATIVE_DIMENSION);
    expect(value.maxContextTokens).toBe(EMBEDDINGGEMMA_MAX_CONTEXT_TOKENS);
  });

  it('formats code queries separately from generic retrieval', () => {
    const value = encodeCodeRetrievalQuery('GraphifyStructuralMaterializer upsert failure');
    expect(value.formattedText).toBe('task: code retrieval | query: GraphifyStructuralMaterializer upsert failure');
    expect(value.mode).toBe('CODE_RETRIEVAL_QUERY');
  });

  it('formats documents with title lineage', () => {
    expect(encodeRetrievalDocument('body').formattedText).toBe('title: none | text: body');
    expect(encodeRetrievalDocument('body', 'Atlas').formattedText).toBe('title: Atlas | text: body');
  });

  it('formats classification queries', () => {
    const value = encodeClassificationQuery('debug database query');
    expect(value.formattedText).toBe('task: classification | query: debug database query');
  });

  it('makes prompt mode and artifact identity part of the cache key', () => {
    const common = {
      modelRevision: 'google/embeddinggemma-300m@rev1',
      artifactChecksum: 'a'.repeat(64),
      executorRevision: 'llama.cpp:b12345',
      representationRevision: 'semantic-512-v1',
    };
    const retrieval = buildEmbeddingGemmaCacheIdentity({ ...common, promptedInput: encodeRetrievalQuery('same text') });
    const code = buildEmbeddingGemmaCacheIdentity({ ...common, promptedInput: encodeCodeRetrievalQuery('same text') });
    expect(retrieval.cacheKeySha256).not.toBe(code.cacheKeySha256);
    expect(retrieval.sourceTextSha256).toBe(code.sourceTextSha256);
  });
});
