import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	requireAuth: vi.fn(),
	recordImpression: vi.fn(),
	rankCombinedResults: vi.fn(),
	hybridSearch: vi.fn(),
	setex: vi.fn(),
	generateEmbeddings: vi.fn(),
	fetchGraphDocuments: vi.fn(),
	computeCentralityForNodes: vi.fn(),
	buildResearchEvidenceBundle: vi.fn(),
	persistPotentialRecommendations: vi.fn(),
	selectBoundedRecommendations: vi.fn(),
	recordView: vi.fn(),
}));

vi.mock('$lib/server/auth-helpers.js', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('$lib/server/ml/recommendation-metrics.js', () => ({
	recommendationMetrics: { recordImpression: mocks.recordImpression },
}));
vi.mock('$lib/server/ml/multi-modal-ranker.js', () => ({ rankCombinedResults: mocks.rankCombinedResults }));
vi.mock('$lib/server/vector/qdrant-manager.js', () => ({ qdrant: { hybridSearch: mocks.hybridSearch } }));
vi.mock('$lib/server/redis.js', () => ({ getRedis: () => ({ setex: mocks.setex }) }));
vi.mock('$lib/server/grpc/embedding-client.js', () => ({ generateEmbeddings: mocks.generateEmbeddings }));
vi.mock('$lib/server/graph/graph-centrality.js', () => ({
	fetchGraphDocuments: mocks.fetchGraphDocuments,
	computeCentralityForNodes: mocks.computeCentralityForNodes,
}));
vi.mock('$lib/server/atlas/recommendations/bounded-research-pipeline.js', () => ({
	buildResearchEvidenceBundle: mocks.buildResearchEvidenceBundle,
	persistPotentialRecommendations: mocks.persistPotentialRecommendations,
	selectBoundedRecommendations: mocks.selectBoundedRecommendations,
}));
vi.mock('$lib/server/ml/user-history.js', () => ({
	UserHistoryTracker: class {
		recordView = mocks.recordView;
	},
}));
vi.mock('$lib/server/ml/recommendation-glyph.js', () => ({
	encodeRecommendations: vi.fn(() => []),
	glyphsToBase64: vi.fn(() => ''),
}));
vi.mock('$lib/server/db/client', () => ({ db: { execute: vi.fn() } }));
vi.mock('$lib/server/db/schema-postgres.js', () => ({ legalDocuments: {} }));

import { POST } from './+server.js';

describe('POST /api/recommendations score inputs', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		mocks.requireAuth.mockResolvedValue({ user: { id: '1' } });
		vi.mocked((await import('$lib/server/db/client')).db.execute).mockResolvedValue({ rows: [{ id: '6b2749f6-03d8-42b7-a4e0-93983c62cc1d' }] } as never);
		mocks.setex.mockResolvedValue('OK');
		mocks.generateEmbeddings.mockResolvedValue({ vectors: [new Array(768).fill(0.125)] });
		mocks.fetchGraphDocuments.mockResolvedValue({ documents: [] });
		mocks.computeCentralityForNodes.mockResolvedValue(new Map());
		mocks.rankCombinedResults.mockResolvedValue([]);
		mocks.buildResearchEvidenceBundle.mockReturnValue({ evidence: [] });
		mocks.selectBoundedRecommendations.mockReturnValue({ ready: [], potential: [], categorySummary: {} });
		mocks.recordImpression.mockResolvedValue(undefined);
		mocks.recordView.mockResolvedValue(undefined);
		mocks.hybridSearch.mockImplementation(async ({ collection }) => ({
			results: collection === 'documents'
				? [
					{ id: 'rag-first', score: 0.83, payload: { title: 'First' } },
					{ id: 'rag-second', score: 0.71, payload: { title: 'Second' } },
				]
				: [{ id: 'graph-fallback', score: 0.62, payload: { title: 'Graph fallback' } }],
		}));
	});

	it('uses result rank for Qdrant relevance and forwards the query embedding to graph fallback', async () => {
		const queryEmbedding = new Array(768).fill(0.125);
		const topRanked = {
			documentId: 'rag-first',
			title: 'First',
			score: 0.91,
			explanationTokens: ['High Retrieval Relevance'],
			signals: {
				retrievalRelevance: 1,
				tagOverlap: 0,
				topicAffinity: 0,
				graphCentrality: 0,
				profileMatch: 0,
				feedbackBoost: 0,
				noveltyScore: 0.5,
				finalScore: 0.91,
			},
		};
		mocks.rankCombinedResults.mockResolvedValue([topRanked]);
		mocks.selectBoundedRecommendations.mockReturnValueOnce({
			ready: [topRanked],
			potential: [],
			discarded: [],
			categorySummary: { research: 1 },
		});
		const response = await POST({
			request: new Request('http://test/api/recommendations', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ query: 'fixture query', caseId: '6b2749f6-03d8-42b7-a4e0-93983c62cc1d', topK: 2 }),
			}),
			locals: { user: { id: '1' } },
		} as never);

		expect(response.status).toBe(200);
		const accepted = await response.json();
		expect(accepted).toMatchObject({ success: true, data: { status: 'processing' } });
		expect(accepted.data.jobId).toMatch(/^[0-9a-f-]{36}$/i);
		await vi.waitFor(() => expect(mocks.rankCombinedResults).toHaveBeenCalledOnce());

		const [, rankedQueryEmbedding, , ragCandidates] = mocks.rankCombinedResults.mock.calls[0];
		expect(mocks.rankCombinedResults.mock.calls[0][6]).toBe(2);
		expect(rankedQueryEmbedding).toEqual(queryEmbedding);
		expect(ragCandidates).toMatchObject([
			{ id: 'rag-first', retrievalRelevance: 1, retrievalSignal: { kind: 'QDRANT_HYBRID', rank: 0, resultCount: 2 } },
			{ id: 'rag-second', retrievalRelevance: 0.5, retrievalSignal: { kind: 'QDRANT_HYBRID', rank: 1, resultCount: 2 } },
		]);
		expect(ragCandidates.every((candidate: { embedding?: number[] }) => candidate.embedding === undefined)).toBe(true);
		await vi.waitFor(() => expect(mocks.setex.mock.calls.some(([key]) => String(key).startsWith('rec:result:'))).toBe(true));
		const resultWrite = mocks.setex.mock.calls.find(([key]) => String(key).startsWith('rec:result:'));
		expect(resultWrite?.[0]).toBe(`rec:result:${accepted.data.jobId}`);
		expect(JSON.parse(String(resultWrite?.[2]))).toMatchObject({
			query: 'fixture query',
			topK: 2,
			totalCandidates: 3,
			surfaceLimit: 4,
			recommendations: [{ documentId: 'rag-first', title: 'First', score: 0.91, signals: { retrievalRelevance: 1 } }],
			metadata: { source_counts: { rag: 2, graph: 1, tags: 0 } },
		});

		const graphSearch = mocks.hybridSearch.mock.calls.find(([params]) => params.collection === 'evidence')?.[0];
		expect(graphSearch?.queryEmbedding).toEqual(queryEmbedding);
		const ragSearch = mocks.hybridSearch.mock.calls.find(([params]) => params.collection === 'documents')?.[0];
		expect(ragSearch?.filters).toEqual({ case_id: '6b2749f6-03d8-42b7-a4e0-93983c62cc1d' });
	});

	it('rejects a case the authenticated user does not own before enqueueing', async () => {
		vi.mocked((await import('$lib/server/db/client')).db.execute).mockResolvedValueOnce({ rows: [] } as never);
		const response = await POST({
			request: new Request('http://test/api/recommendations', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ query: 'fixture query', caseId: '6b2749f6-03d8-42b7-a4e0-93983c62cc1d' }),
			}),
			locals: { user: { id: '1' } },
		} as never);

		expect(response.status).toBe(404);
		expect(mocks.setex).not.toHaveBeenCalled();
		expect(mocks.hybridSearch).not.toHaveBeenCalled();
	});
});
