import { describe, expect, it } from 'vitest';
import {
  createSemanticEmbeddingCacheKeyV2,
  hashSemanticEmbeddingCacheKeyV2,
  serializeSemanticEmbeddingCacheKeyV2,
} from './semantic-embedding-cache-key-v2.js';

const input = {
  representationId: 'semantic_768' as const,
  representationRevision: 'semantic_768@runtime-1',
  modelArtifactRevision: 'gguf:abc',
  tokenizerRevision: 'tokenizer:def',
  inputPolicyRevision: 'input-policy:2048-v1',
  normalizedInputChecksum: 'sha256:input',
};

describe('SemanticEmbeddingCacheKeyV2', () => {
  it('binds every representation and input lineage field', () => {
    const key = createSemanticEmbeddingCacheKeyV2(input);
    expect(key.schema).toBe('atlas.semantic-embedding-cache-key.v2');
    expect(Object.keys(key)).toHaveLength(7);
  });

  it('changes deterministically when any lineage field changes', () => {
    const first = hashSemanticEmbeddingCacheKeyV2(createSemanticEmbeddingCacheKeyV2(input));
    const second = hashSemanticEmbeddingCacheKeyV2(createSemanticEmbeddingCacheKeyV2({ ...input, tokenizerRevision: 'tokenizer:changed' }));
    expect(first).not.toBe(second);
    expect(serializeSemanticEmbeddingCacheKeyV2(createSemanticEmbeddingCacheKeyV2(input))).toBe(serializeSemanticEmbeddingCacheKeyV2(createSemanticEmbeddingCacheKeyV2(input)));
  });

  it('rejects non-canonical representations and missing lineage', () => {
    expect(() => createSemanticEmbeddingCacheKeyV2({ ...input, representationId: 'latent_256' as 'semantic_768' })).toThrow('CACHE_KEY_REPRESENTATION_MUST_BE_SEMANTIC_768');
    expect(() => createSemanticEmbeddingCacheKeyV2({ ...input, modelArtifactRevision: '' })).toThrow('CACHE_KEY_MODEL_ARTIFACT_REVISION_REQUIRED');
  });
});
