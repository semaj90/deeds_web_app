import { describe, expect, it, vi } from 'vitest';
import {
  createProviderEmbeddingExecutorV1,
  executeProviderEmbeddingV1,
} from './embedding-provider-executor-v1';

const unit = (n = 768) => Array.from({ length: n }, (_, i) => (i === 0 ? 1 : 0));
const ollama = { provider: 'ollama' as const, baseUrl: 'http://127.0.0.1:11434/', modelId: 'embeddinggemma:latest' };
const llama = { provider: 'llama_cpp_gguf' as const, baseUrl: 'http://127.0.0.1:8081', modelId: 'embeddinggemma:latest' };

function jsonFetch(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
}

describe('provider embedding executor', () => {
  it('ollama: posts the Ollama request shape and returns the raw embedding', async () => {
    const fetchImpl = jsonFetch({ embedding: unit() });
    const run = createProviderEmbeddingExecutorV1({ provider: ollama, fetchImpl });
    expect(await run('hello')).toHaveLength(768);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:11434/api/embeddings');
    expect(JSON.parse(String(init.body))).toEqual({ model: 'embeddinggemma:latest', prompt: 'hello' });
  });

  it('preserves a caller-specified Ollama keep-alive without imposing one on other callers', async () => {
    const fetchImpl = jsonFetch({ embedding: unit() });
    await createProviderEmbeddingExecutorV1({ provider: ollama, keepAlive: '24h', fetchImpl })('hello');
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ model: 'embeddinggemma:latest', prompt: 'hello', keep_alive: '24h' });
  });

  it('supports legacy Ollama singular and batch response shapes', async () => {
    const fetchImpl = jsonFetch({ embeddings: [unit()] });
    const result = await createProviderEmbeddingExecutorV1({ provider: ollama, fetchImpl })('hello');
    expect(result).toHaveLength(768);
  });

  it('llama_cpp_gguf: posts the OpenAI-compatible shape', async () => {
    const fetchImpl = jsonFetch({ data: [{ embedding: unit() }] });
    const run = createProviderEmbeddingExecutorV1({ provider: llama, fetchImpl });
    expect(await run('hello')).toHaveLength(768);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:8081/v1/embeddings');
    expect(JSON.parse(String(init.body))).toEqual({ model: 'embeddinggemma', input: 'hello' });
  });

  it('a caller-supplied base URL overrides the provider base URL only', async () => {
    const fetchImpl = jsonFetch({ embedding: unit() });
    await createProviderEmbeddingExecutorV1({ provider: ollama, baseUrl: 'http://10.0.0.5:9999', fetchImpl })('x');
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe('http://10.0.0.5:9999/api/embeddings');
  });

  it('HTTP failures keep the EMBEDDING_HTTP_<status> shape', async () => {
    const run = createProviderEmbeddingExecutorV1({ provider: ollama, fetchImpl: jsonFetch({}, 503) });
    await expect(run('x')).rejects.toThrow('EMBEDDING_HTTP_503');
  });

  it('onnx provider and a missing base URL fail closed instead of guessing a backend', async () => {
    const onnx = createProviderEmbeddingExecutorV1({ provider: { provider: 'onnx_directml', baseUrl: null, modelId: 'm' }, fetchImpl: jsonFetch({}) });
    await expect(onnx('x')).rejects.toThrow('EMBEDDING_PROVIDER_UNSUPPORTED_FOR_EXECUTOR');
    const none = createProviderEmbeddingExecutorV1({ provider: { provider: 'ollama', baseUrl: null, modelId: 'm' }, fetchImpl: jsonFetch({}) });
    await expect(none('x')).rejects.toThrow('EMBEDDING_PROVIDER_BASE_URL_MISSING');
  });

  it('does not retry or fall back: exactly one request per call, even on failure', async () => {
    const fetchImpl = jsonFetch({}, 500);
    await expect(createProviderEmbeddingExecutorV1({ provider: ollama, fetchImpl })('x')).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('through the adapter: recipe is explicit, bad vectors are rejected, nothing is persisted', async () => {
    const ok = await executeProviderEmbeddingV1({ text: 'query', mode: 'unprompted_legacy', provider: ollama, fetchImpl: jsonFetch({ embedding: unit() }) });
    expect(ok.inputRecipe.mode).toBe('unprompted_legacy');
    expect(ok.persistencePerformed).toBe(false);
    expect(ok.embedding).toHaveLength(768);
    await expect(
      executeProviderEmbeddingV1({ text: 'query', provider: ollama, fetchImpl: jsonFetch({ embedding: unit(384) }) }),
    ).rejects.toThrow('EMBEDDING_EXECUTOR_VECTOR_INVALID');
    await expect(
      executeProviderEmbeddingV1({ text: 'query', provider: ollama, fetchImpl: jsonFetch({ embedding: Array(768).fill(0) }) }),
    ).rejects.toThrow('EMBEDDING_EXECUTOR_VECTOR_INVALID');
  });

  it('a prompted mode formats the input, so the executor receives the prefixed text', async () => {
    const fetchImpl = jsonFetch({ embedding: unit() });
    const result = await executeProviderEmbeddingV1({ text: 'find auth', mode: 'retrieval_query', provider: ollama, fetchImpl });
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.prompt).toContain('find auth');
    expect(body.prompt).not.toBe('find auth');
    expect(result.inputRecipe.mode).toBe('retrieval_query');
  });
});
