import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  embedText: vi.fn(),
  acquireGpuLease: vi.fn(),
  rateCheck: vi.fn(),
}));

vi.mock('$lib/server/embedding/embed.js', () => ({ embedText: mocks.embedText }));
vi.mock('$lib/server/inference/gpu-arbiter.js', () => ({ acquireGpuLease: mocks.acquireGpuLease }));
vi.mock('$lib/server/middleware/rate-limiter.js', () => ({
  embedRateLimiter: { check: mocks.rateCheck },
}));
vi.mock('$lib/server/ai/onnx-server.js', () => ({ runEmbedding: vi.fn() }));
vi.mock('$lib/server/observability/langfuse.js', () => ({ traceEmbedding: vi.fn() }));
vi.mock('$lib/server/embedding/embedding-provider-v1.js', () => ({
  resolveEmbeddingProviderV1: () => ({ provider: 'ollama' }),
  checkVectorShapeV1: (embedding: number[]) => ({
    ok: embedding.length === 768 && embedding.every(Number.isFinite),
    failures: [],
  }),
}));

import { POST } from './+server.js';

const vector = Array.from({ length: 768 }, () => 1 / Math.sqrt(768));

function request(body: unknown): Request {
  return new Request('http://localhost/api/embed', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function post(body: unknown): Promise<Response> {
  return POST({ request: request(body), locals: { user: { id: 'test-user' } } } as never);
}

describe('/api/embed task recipes', () => {
  beforeEach(() => {
    mocks.embedText.mockReset().mockResolvedValue(vector);
    mocks.acquireGpuLease.mockReset().mockResolvedValue(undefined);
    mocks.rateCheck.mockReset().mockReturnValue({ allowed: true });
  });

  it('keeps legacy requests raw and omits task recipe metadata', async () => {
    const response = await post({ text: ' find writer ' });

    expect(response.status).toBe(200);
    expect(mocks.embedText).toHaveBeenCalledWith(' find writer ');
    expect(await response.json()).not.toHaveProperty('inputRecipe');
  });

  it('labels an explicitly selected unprompted legacy recipe', async () => {
    const response = await post({ text: ' raw corpus text ', taskMode: 'unprompted_legacy' });
    const payload = await response.json();

    expect(mocks.embedText).toHaveBeenCalledWith(' raw corpus text ');
    expect(payload.inputRecipe).toMatchObject({
      mode: 'unprompted_legacy',
      promptRevision: 'unprompted-v0',
    });
  });

  it('formats an explicitly selected query mode and returns its prompt receipt', async () => {
    const response = await post({ text: ' find writer ', taskMode: 'retrieval_query' });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.embedText).toHaveBeenCalledWith('task: search result | query: find writer');
    expect(payload.inputRecipe).toMatchObject({
      mode: 'retrieval_query',
      promptRevision: 'embeddinggemma.task-prompts.google-v1',
    });
    expect(payload.inputRecipe.formattedInputChecksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects task modes for mock embeddings and non-native dimensions', async () => {
    const mockResponse = await post({ text: 'test', model: 'mock', taskMode: 'retrieval_query' });
    const projectedResponse = await post({ text: 'test', taskMode: 'retrieval_query', dimensions: 384 });
    const unprompted384Response = await post({ text: 'test', dimensions: 384 });
    const mrlRequestResponse = await post({ text: 'test', dimensions: 512 });

    expect(mockResponse.status).toBe(400);
    expect(projectedResponse.status).toBe(400);
    expect(unprompted384Response.status).toBe(400);
    expect(mrlRequestResponse.status).toBe(400);
    expect(mocks.embedText).not.toHaveBeenCalled();
  });
});
