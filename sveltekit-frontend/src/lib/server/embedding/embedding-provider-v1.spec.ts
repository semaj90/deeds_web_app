import { describe, expect, it } from 'vitest';

import { resolveEmbeddingProviderFromEnvV1 } from './embedding-provider-v1.js';

describe('EMBED-PROVIDER-CONVERGENCE-01', () => {
  it('routes dev:gpu EMBEDDING_BACKEND=onnx_directml to in-process ONNX on Windows without an HTTP URL', () => {
    expect(resolveEmbeddingProviderFromEnvV1({
      EMBEDDING_BACKEND: 'onnx_directml',
      OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
    }, 'win32')).toEqual({
      provider: 'onnx_directml',
      baseUrl: null,
      modelId: 'embeddinggemma:latest',
      dimensions: 768,
      representationId: 'semantic_768',
    });
  });

  it('honors explicit EMBEDDING_PROVIDER=onnx_directml before a stale dedicated URL', () => {
    const resolved = resolveEmbeddingProviderFromEnvV1({
      EMBEDDING_PROVIDER: 'onnx_directml',
      EMBEDDING_BASE_URL: 'http://127.0.0.1:8081',
      OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
    }, 'win32');
    expect(resolved.provider).toBe('onnx_directml');
    expect(resolved.baseUrl).toBeNull();
  });

  it('does not claim DirectML on a non-Windows runtime', () => {
    const resolved = resolveEmbeddingProviderFromEnvV1({
      EMBEDDING_BACKEND: 'onnx_directml',
      OLLAMA_BASE_URL: 'http://127.0.0.1:11434/',
    }, 'linux');
    expect(resolved.provider).toBe('ollama');
    expect(resolved.baseUrl).toBe('http://127.0.0.1:11434');
  });

  it('uses a concrete dedicated embedding URL as llama_cpp_gguf evidence', () => {
    const resolved = resolveEmbeddingProviderFromEnvV1({
      EMBEDDING_PROVIDER: 'ollama',
      EMBEDDING_BASE_URL: 'http://127.0.0.1:8081/',
      OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
    }, 'win32');
    expect(resolved.provider).toBe('llama_cpp_gguf');
    expect(resolved.baseUrl).toBe('http://127.0.0.1:8081');
  });

  it('falls back to Ollama when no in-process or dedicated provider is selected', () => {
    expect(resolveEmbeddingProviderFromEnvV1({}, 'win32')).toEqual({
      provider: 'ollama',
      baseUrl: 'http://127.0.0.1:11434',
      modelId: 'embeddinggemma:latest',
      dimensions: 768,
      representationId: 'semantic_768',
    });
  });

  it('preserves a configured Ollama fallback URL and strips a trailing slash', () => {
    const resolved = resolveEmbeddingProviderFromEnvV1({
      OLLAMA_BASE_URL: 'http://host.docker.internal:11434/',
    }, 'win32');
    expect(resolved.provider).toBe('ollama');
    expect(resolved.baseUrl).toBe('http://host.docker.internal:11434');
  });
});
