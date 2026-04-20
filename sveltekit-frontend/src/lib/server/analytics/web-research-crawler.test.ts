import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const dbValuesMock = vi.fn(() => Promise.resolve([]));
	return {
		hybridSearchMock: vi.fn(),
		generateEmbeddingsWithTagsMock: vi.fn(),
		redisSetMock: vi.fn(() => Promise.resolve('OK')),
		redisZaddMock: vi.fn(() => Promise.resolve(1)),
		redisExpireMock: vi.fn(() => Promise.resolve(1)),
		persistResearchSummaryBatchMock: vi.fn(() => Promise.resolve(1)),
		buildAndWarmPrefixMock: vi.fn(() => Promise.resolve()),
		backfillWebGlyphsMock: vi.fn(() => Promise.resolve()),
		dbInsertMock: vi.fn(() => ({ values: dbValuesMock })),
		dbValuesMock,
	};
});

vi.mock('$lib/server/retrieval/web-search.js', () => ({
	webSearch: vi.fn(async () => null),
}));

vi.mock('$lib/server/ollama.js', () => ({
	bifrostChat: vi.fn(async () => '[]'),
}));

vi.mock('$lib/server/redis.js', () => ({
	getRedis: vi.fn(() => ({
		set: mocks.redisSetMock,
		zadd: mocks.redisZaddMock,
		expire: mocks.redisExpireMock,
		get: vi.fn(async () => null),
		zcard: vi.fn(async () => 0),
		zrevrange: vi.fn(async () => []),
		mget: vi.fn(async () => []),
		keys: vi.fn(async () => []),
		del: vi.fn(async () => 0),
	})),
}));

vi.mock('$lib/server/grpc/embedding-client.js', () => ({
	generateEmbeddingsWithTags: mocks.generateEmbeddingsWithTagsMock,
}));

vi.mock('$lib/server/vector/qdrant-manager.js', () => ({
	qdrant: {
		hybridSearch: mocks.hybridSearchMock,
	},
}));

vi.mock('$lib/server/analytics/research-summaries-db.js', () => ({
	persistResearchSummaryBatch: mocks.persistResearchSummaryBatchMock,
}));

vi.mock('$lib/server/inference/turbo-prefix-cache.js', () => ({
	buildAndWarmPrefix: mocks.buildAndWarmPrefixMock,
}));

vi.mock('$lib/server/analytics/minified-research-cache.js', () => ({
	backfillWebGlyphs: mocks.backfillWebGlyphsMock,
}));

vi.mock('$lib/server/db/client', () => ({
	db: {
		insert: mocks.dbInsertMock,
	},
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
	contextTimeline: {},
}));

import { crawlLegalCorpus } from './web-research-crawler.js';

describe('crawlLegalCorpus', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.generateEmbeddingsWithTagsMock.mockResolvedValue({
			result: { vectors: [[0.1, 0.2]] },
			qdrantTags: [],
		});
		mocks.hybridSearchMock.mockImplementation(async ({ collection }: { collection: string }) => {
			if (collection === 'legal_canon_chunks') {
				return {
					results: [{
						id: 'canon-1',
						score: 0.95,
						payload: {
							chunk_text: 'Federal Rule 803 exception summary.',
							citation_label: 'FRE 803',
						},
					}],
				};
			}

			if (collection === 'documents') {
				return {
					results: [{
						id: 'doc-1',
						score: 0.98,
						payload: {
							chunk_text: 'Evidence summary note.',
							citation_label: 'Context memo',
						},
					}],
				};
			}

			return { results: [] };
		});
	});

	it('prefers canonical hits over close-score contextual documents', async () => {
		const result = await crawlLegalCorpus('hearsay exception', 'ace', 2);

		expect(result.summaries).toHaveLength(2);
		expect(result.summaries.map(summary => summary.collection)).toEqual([
			'legal_canon_chunks',
			'documents',
		]);
		expect(result.summaries[0]?.relevanceScore).toBeGreaterThan(result.summaries[1]?.relevanceScore ?? 0);
		expect(mocks.redisZaddMock).toHaveBeenCalledWith('corpus:idx:ace', result.summaries[0]?.relevanceScore, 'canon-1');
	});
});