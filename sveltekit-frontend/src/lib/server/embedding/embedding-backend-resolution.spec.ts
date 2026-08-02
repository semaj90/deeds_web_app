import { describe, expect, it } from 'vitest';

import { resolveEmbeddingBackend } from './embedding-backend-resolution.js';

describe('resolveEmbeddingBackend', () => {
  it('defaults the embedding lane to llama-server when no provider is set', () => {
    const resolution = resolveEmbeddingBackend('embeddinggemma:latest', {
      configuredBaseUrl: 'http://127.0.0.1:8090',
    });

    expect(resolution.provider).toBe('llama-server');
    expect(resolution.baseUrl).toBe('http://127.0.0.1:8090');
    expect(resolution.model).toBe('embeddinggemma:latest');
  });

  it('keeps explicit ollama selection when requested', () => {
    const resolution = resolveEmbeddingBackend('embeddinggemma:latest', {
      provider: 'ollama',
      configuredBaseUrl: 'http://127.0.0.1:11434',
    });

    expect(resolution.provider).toBe('ollama');
    expect(resolution.baseUrl).toBe('http://127.0.0.1:11434');
  });
});
