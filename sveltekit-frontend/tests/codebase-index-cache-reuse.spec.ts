// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	mockFetch,
	mockGetCachedEmbedding,
	mockSetCachedEmbedding,
	mockGetCachedSearchResults,
	mockSetCachedSearchResults,
	mockOllamaFetch,
	mockPoolQuery,
} = vi.hoisted(() => ({
	mockFetch: vi.fn(),
	mockGetCachedEmbedding: vi.fn(),
	mockSetCachedEmbedding: vi.fn(),
	mockGetCachedSearchResults: vi.fn(),
	mockSetCachedSearchResults: vi.fn(),
	mockOllamaFetch: vi.fn(),
	mockPoolQuery: vi.fn(),
}));

vi.mock('$lib/server/knowledge-cache.js', () => ({
	getCachedEmbedding: (...args: unknown[]) => mockGetCachedEmbedding(...args),
	setCachedEmbedding: (...args: unknown[]) => mockSetCachedEmbedding(...args),
	getCachedSearchResults: (...args: unknown[]) => mockGetCachedSearchResults(...args),
	setCachedSearchResults: (...args: unknown[]) => mockSetCachedSearchResults(...args),
}));

vi.mock('$lib/server/ollama.js', () => ({
	ollamaFetch: (...args: unknown[]) => mockOllamaFetch(...args),
}));

vi.mock('$lib/server/gpu/libtorch-bridge.js', () => ({
	runWithAdaptiveBatch: async <T>(items: T[], handler: (batch: T[]) => Promise<void>) => {
		await handler(items);
	},
}));

vi.mock('$lib/server/db/client', () => ({
	pool: {
		query: (...args: unknown[]) => mockPoolQuery(...args),
	},
}));

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

function embedding(seed: number) {
	return Array.from({ length: 768 }, (_, index) => Number((seed + index / 1000).toFixed(6)));
}

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	vi.stubGlobal('fetch', mockFetch);
	mockSetCachedEmbedding.mockResolvedValue(undefined);
	mockSetCachedSearchResults.mockResolvedValue(undefined);
	mockGetCachedEmbedding.mockResolvedValue(null);
	mockGetCachedSearchResults.mockResolvedValue(null);
	mockOllamaFetch.mockResolvedValue(jsonResponse({ embedding: embedding(0.25) }));
	mockPoolQuery.mockResolvedValue({ rows: [] });
	mockFetch.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
		const url = String(input);
		if (url.includes('/collections/codebase_chunks_768/points')) {
			return jsonResponse({ status: 'ok' });
		}
		if (url.includes('/collections/codebase_chunks_768')) {
			return jsonResponse({ result: {} });
		}
		throw new Error(`Unexpected fetch: ${url} ${init?.method ?? 'GET'}`);
	});
});

describe('codebase index cache reuse', () => {
	it('reuses cached embeddings during indexing reruns instead of calling Ollama again', async () => {
		const content = 'export const cachedContent = true;';
		const signature = 'function cachedContent(): boolean';
		mockGetCachedEmbedding.mockImplementation(async (text: string) => {
			if (text === content || text === signature) {
				return embedding(0.4);
			}
			return null;
		});

		const { indexChunks } = await import('../src/lib/server/indexer/dual-embedder.js');
		const result = await indexChunks([
			{
				id: 'chunk-1',
				content,
				signature,
				metadata: {
					path: 'src/lib/server/example.ts',
					relativePath: 'src/lib/server/example.ts',
					kind: 'function',
					symbol: 'cachedContent',
					lineStart: 1,
					lineEnd: 1,
					tags: ['server'],
				},
			},
		]);

		expect(mockGetCachedEmbedding).toHaveBeenCalledTimes(2);
		expect(mockOllamaFetch).not.toHaveBeenCalled();
		expect(result.storedInQdrant).toBe(1);
		expect(result.failed).toBe(0);
	});
});

describe('codebase retrieval cache reuse', () => {
	it('reuses cached query/search state and still cosine-ranks results for LLM retrieval', async () => {
		mockGetCachedEmbedding.mockResolvedValue(embedding(0.1));
		mockGetCachedSearchResults.mockImplementation(async (collection: string) => {
			if (collection.includes(':content:limit:15')) {
				return [
					{
						id: 'chunk-a',
						score: 0.9,
						payload: {
							path: 'src/routes/a/+server.ts',
							relativePath: 'src/routes/a/+server.ts',
							symbol: 'getA',
							kind: 'server-route',
							content: 'export const GET = async () => new Response("a");',
							signature: 'GET /a',
							lineStart: 1,
							lineEnd: 1,
							tags: ['route'],
						},
					},
					{
						id: 'chunk-b',
						score: 0.7,
						payload: {
							path: 'src/lib/server/b.ts',
							relativePath: 'src/lib/server/b.ts',
							symbol: 'getB',
							kind: 'server-module',
							content: 'export async function getB() { return "b"; }',
							signature: 'getB()',
							lineStart: 10,
							lineEnd: 12,
							tags: ['server'],
						},
					},
				];
			}

			if (collection.includes(':signature:limit:15')) {
				return [
					{
						id: 'chunk-b',
						score: 0.95,
						payload: {
							path: 'src/lib/server/b.ts',
							relativePath: 'src/lib/server/b.ts',
							symbol: 'getB',
							kind: 'server-module',
							content: 'export async function getB() { return "b"; }',
							signature: 'getB()',
							lineStart: 10,
							lineEnd: 12,
							tags: ['server'],
						},
					},
				];
			}

			return [];
		});
		mockFetch.mockImplementation(async (input: string | URL | Request) => {
			const url = String(input);
			if (url.includes('/points/scroll')) {
				return jsonResponse({ result: { points: [] } });
			}
			throw new Error(`unexpected vector search fetch: ${url}`);
		});

		const { rerankChunks } = await import('../src/lib/server/retrieval/codebase-context.js');
		const result = await rerankChunks('cached retrieval query', { limit: 5 });

		const relativePaths = result.results.map((entry) => entry.relativePath);
		expect(relativePaths[0]).toBe('src/lib/server/b.ts');
		expect(relativePaths[1]).toBe('src/routes/a/+server.ts');
		expect(mockOllamaFetch).not.toHaveBeenCalled();
		expect(
			mockFetch.mock.calls.some(([input]) => String(input).includes('/points/search'))
		).toBe(false);
		expect(mockGetCachedSearchResults).toHaveBeenCalledTimes(2);
	});
});