import { describe, expect, it, vi } from 'vitest';
import { embedAtlasSearchQuery } from './embedding.js';

describe('Atlas search query embedding', () => {
  it('fails closed without strict mode and never calls the legacy embedding route', async () => {
    const embed = vi.fn();

    await expect(embedAtlasSearchQuery('query', {
      strict: false,
      model: 'embeddinggemma',
    }, embed as never)).resolves.toBeNull();

    expect(embed).not.toHaveBeenCalled();
  });

  it('requires immutable lineage configuration before strict embedding', async () => {
    const embed = vi.fn();

    await expect(embedAtlasSearchQuery('query', {
      strict: true,
      model: 'embeddinggemma',
    }, embed as never)).rejects.toThrow('SEMANTIC_768_STRICT_LINEAGE_CONFIGURATION_REQUIRED');

    expect(embed).not.toHaveBeenCalled();
  });

  it('uses only the strict semantic_768 executor', async () => {
    const embed = vi.fn().mockResolvedValue({ embedding: Array(768).fill(0.01) });
    const config = {
      strict: true,
      model: 'embeddinggemma',
      modelArtifactRevision: 'sha256:model',
      tokenizerRevision: 'sha256:tokenizer',
      inputPolicyRevision: 'atlas-input-v1',
      baseUrl: 'http://127.0.0.1:8081',
    };

    await expect(embedAtlasSearchQuery('query', config, embed as never))
      .resolves.toEqual(Array(768).fill(0.01));
    expect(embed).toHaveBeenCalledWith('query', {
      model: config.model,
      modelArtifactRevision: config.modelArtifactRevision,
      tokenizerRevision: config.tokenizerRevision,
      inputPolicyRevision: config.inputPolicyRevision,
      baseUrl: config.baseUrl,
      timeoutMs: 20_000,
    });
  });
});
