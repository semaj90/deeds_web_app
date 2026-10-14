import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	search: vi.fn(),
	upsert: vi.fn(),
	delete: vi.fn(),
	resolveRevision: vi.fn(),
	generateEmbedding: vi.fn(),
}));

vi.mock('$lib/server/vector/qdrant-manager.js', () => ({
	qdrant: {
		collections: { llm_cache: 'llm_response_cache' },
		search: mocks.search,
		upsert: mocks.upsert,
		client: { delete: mocks.delete },
	},
	deterministicPointId: vi.fn((value: string) => value),
}));

vi.mock('$lib/server/cache-keys.js', () => ({
	generateContextHash: vi.fn(() => 'context-hash'),
}));

vi.mock('$lib/server/grpc/embedding-client.js', () => ({
	generateEmbedding: mocks.generateEmbedding,
	resolveEmbeddingArtifactRevisionV1: mocks.resolveRevision,
}));

import { lookupCachedResponse, storeCachedResponse } from './llm-cache.js';

const modelRevision = `sha256:${'a'.repeat(64)}`;
const vector = Array.from({ length: 768 }, (_, index) => index / 768);

describe('LLM semantic cache embedding provenance', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.search.mockResolvedValue([]);
		mocks.upsert.mockResolvedValue(undefined);
		mocks.resolveRevision.mockResolvedValue(modelRevision);
		mocks.generateEmbedding.mockResolvedValue(vector);
	});

	it('fails closed when the active embedding artifact digest is unavailable', async () => {
		mocks.resolveRevision.mockResolvedValue(null);

		await expect(lookupCachedResponse({ query: 'query', context: 'context' })).resolves.toEqual({
			hit: false,
		});
		await storeCachedResponse({
			query: 'query',
			queryEmbedding: vector,
			embeddingModelRevision: modelRevision,
			context: 'context',
			response: 'answer',
			model: 'model',
		});

		expect(mocks.search).not.toHaveBeenCalled();
		expect(mocks.upsert).not.toHaveBeenCalled();
	});

	it('filters semantic hits by the current embedding artifact digest', async () => {
		await lookupCachedResponse({ query: 'query', context: 'context' });

		expect(mocks.search).toHaveBeenCalledWith(
			'llm_response_cache',
			expect.objectContaining({
				filter: expect.objectContaining({
					must: expect.arrayContaining([
						{ key: 'embeddingModelRevision', match: { value: modelRevision } },
					]),
				}),
			}),
		);
	});

	it('regenerates through the qualified provider before writing an unbound vector', async () => {
		await storeCachedResponse({
			query: 'query',
			queryEmbedding: Array(768).fill(0),
			embeddingModelRevision: `sha256:${'b'.repeat(64)}`,
			context: 'context',
			response: 'answer',
			model: 'model',
		});

		expect(mocks.generateEmbedding).toHaveBeenCalledWith('query', {
			taskMode: 'unprompted_legacy',
		});
		expect(mocks.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				points: [
					expect.objectContaining({
						vector: { query: vector },
						payload: expect.objectContaining({ embeddingModelRevision: modelRevision }),
					}),
				],
			}),
		);
	});
});
