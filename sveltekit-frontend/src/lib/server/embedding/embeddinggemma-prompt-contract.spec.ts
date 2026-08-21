import { describe, expect, it } from 'vitest';
import { buildEmbeddingGemmaCacheIdentity, encodeClassificationQuery, encodeCodeRetrievalQuery, encodeRetrievalDocument, encodeRetrievalQuery, EMBEDDINGGEMMA_MAX_CONTEXT_TOKENS, EMBEDDINGGEMMA_NATIVE_DIMENSION } from './embeddinggemma-prompt-contract.js';

describe('EmbeddingGemma prompt authority', () => {
  it('freezes retrieval, code, document and classification prompts', () => {
    expect(encodeRetrievalQuery('find the packet writer').formattedText).toBe('task: search result | query: find the packet writer');
    expect(encodeCodeRetrievalQuery('GraphifyStructuralMaterializer upsert failure').formattedText).toBe('task: code retrieval | query: GraphifyStructuralMaterializer upsert failure');
    expect(encodeRetrievalDocument('body').formattedText).toBe('title: none | text: body');
    expect(encodeRetrievalDocument('body', 'Atlas').formattedText).toBe('title: Atlas | text: body');
    expect(encodeClassificationQuery('debug database query').formattedText).toBe('task: classification | query: debug database query');
  });
  it('freezes native dimension and maximum context', () => {
    const value = encodeRetrievalQuery('query');
    expect(value.nativeDimension).toBe(EMBEDDINGGEMMA_NATIVE_DIMENSION); expect(value.nativeDimension).toBe(768);
    expect(value.maxContextTokens).toBe(EMBEDDINGGEMMA_MAX_CONTEXT_TOKENS); expect(value.maxContextTokens).toBe(2048);
  });
  it('makes prompt mode part of the cache identity', () => {
    const common={modelRevision:'model-a',artifactChecksum:'a'.repeat(64),executorRevision:'exec-1',representationRevision:'semantic-512-v1'};
    const retrieval=buildEmbeddingGemmaCacheIdentity({...common,promptedInput:encodeRetrievalQuery('same text')});
    const code=buildEmbeddingGemmaCacheIdentity({...common,promptedInput:encodeCodeRetrievalQuery('same text')});
    expect(retrieval.cacheKeySha256).not.toBe(code.cacheKeySha256); expect(retrieval.sourceTextSha256).toBe(code.sourceTextSha256);
  });
  it('binds artifact and executor revision', () => {
    const promptedInput=encodeRetrievalQuery('same text');
    const a=buildEmbeddingGemmaCacheIdentity({modelRevision:'model-a',artifactChecksum:'a'.repeat(64),executorRevision:'exec-1',promptedInput,representationRevision:'semantic-512-v1'});
    const b=buildEmbeddingGemmaCacheIdentity({modelRevision:'model-a',artifactChecksum:'b'.repeat(64),executorRevision:'exec-2',promptedInput,representationRevision:'semantic-512-v1'});
    expect(a.cacheKeySha256).not.toBe(b.cacheKeySha256);
  });
});
