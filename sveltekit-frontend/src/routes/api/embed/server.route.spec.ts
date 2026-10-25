import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	embedTextWithResult: vi.fn(),
  acquireGpuLease: vi.fn(),
  rateCheck: vi.fn(),
}));

vi.mock('$lib/server/embedding/embed.js', () => ({ embedTextWithResult: mocks.embedTextWithResult }));
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
		mocks.embedTextWithResult.mockReset().mockResolvedValue({
			vectors: [vector],
			model: 'embeddinggemma:observed-test',
			dimension: 768,
			source: 'http-ollama',
			totalMs: 5,
			cacheHit: false,
		});
    mocks.acquireGpuLease.mockReset().mockResolvedValue(undefined);
    mocks.rateCheck.mockReset().mockReturnValue({ allowed: true });
  });

  it('keeps legacy requests raw and omits task recipe metadata', async () => {
    const response = await post({ text: ' find writer ' });
		const payload = await response.json();

    expect(response.status).toBe(200);
		expect(mocks.embedTextWithResult).toHaveBeenCalledWith(' find writer ');
		expect(payload).not.toHaveProperty('inputRecipe');
		expect(payload).toMatchObject({
			executionObservation: {
				schema: 'atlas.embedding-execution-observation.v1',
				status: 'OBSERVED_NOT_VERIFIED',
				source: 'http-ollama',
				reportedModel: 'embeddinggemma:observed-test',
				cacheHit: false,
				inputChecksum: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
				vectorChecksum: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
			},
		});
  });

  it('labels an explicitly selected unprompted legacy recipe', async () => {
    const response = await post({ text: ' raw corpus text ', taskMode: 'unprompted_legacy' });
    const payload = await response.json();

		expect(mocks.embedTextWithResult).toHaveBeenCalledWith(' raw corpus text ');
    expect(payload.inputRecipe).toMatchObject({
      mode: 'unprompted_legacy',
      promptRevision: 'unprompted-v0',
    });
  });

  it('formats an explicitly selected query mode and returns its prompt receipt', async () => {
    const response = await post({ text: ' find writer ', taskMode: 'retrieval_query' });
    const payload = await response.json();

    expect(response.status).toBe(200);
		expect(mocks.embedTextWithResult).toHaveBeenCalledWith('task: search result | query: find writer');
    expect(payload.inputRecipe).toMatchObject({
      mode: 'retrieval_query',
      promptRevision: 'embeddinggemma.task-prompts.google-v1',
    });
    expect(payload.inputRecipe.formattedInputChecksum).toMatch(/^[a-f0-9]{64}$/);
  });

	it('reports cache as the observed source without claiming verification', async () => {
		mocks.embedTextWithResult.mockResolvedValueOnce({
			vectors: [vector],
			model: 'embeddinggemma:cached-test',
			dimension: 768,
			source: 'http-ollama',
			totalMs: 1,
			cacheHit: true,
		});
		const response = await post({ text: 'cached query' });
		const payload = await response.json();

		expect(payload.executionObservation).toMatchObject({
			status: 'OBSERVED_NOT_VERIFIED',
			source: 'cache',
			cacheHit: true,
		});
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
		expect(mocks.embedTextWithResult).not.toHaveBeenCalled();
  });
});
