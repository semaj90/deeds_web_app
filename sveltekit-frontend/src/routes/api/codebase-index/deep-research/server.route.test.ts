// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

const {
	mockRunDeepResearchIndex,
	mockRedisGet,
	mockRedisSetex,
	mockPublishWorkflowEvent,
	mockPublishWorkflowComplete,
	mockPublishWorkflowError,
} = vi.hoisted(() => ({
	mockRunDeepResearchIndex: vi.fn(),
	mockRedisGet: vi.fn(),
	mockRedisSetex: vi.fn(),
	mockPublishWorkflowEvent: vi.fn(),
	mockPublishWorkflowComplete: vi.fn(),
	mockPublishWorkflowError: vi.fn(),
}));

vi.mock('$lib/server/indexer/web-search-indexer.js', () => ({
	runDeepResearchIndex: (...args: unknown[]) => mockRunDeepResearchIndex(...args),
}));

vi.mock('$lib/server/redis.js', () => ({
	getRedis: () => ({
		get: (...args: unknown[]) => mockRedisGet(...args),
		setex: (...args: unknown[]) => mockRedisSetex(...args),
	}),
}));

vi.mock('$lib/server/queue/workflow-publish.js', () => ({
	publishWorkflowEvent: (...args: unknown[]) => mockPublishWorkflowEvent(...args),
	publishWorkflowComplete: (...args: unknown[]) => mockPublishWorkflowComplete(...args),
	publishWorkflowError: (...args: unknown[]) => mockPublishWorkflowError(...args),
}));

describe('/api/codebase-index/deep-research', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		mockRedisGet.mockResolvedValue(null);
		mockRedisSetex.mockResolvedValue('OK');
		mockRunDeepResearchIndex.mockResolvedValue({
			queriesRun: 1,
			pagesIndexed: 1,
			pagesSkipped: 0,
			pagesFailed: 0,
			rowsInserted: 1,
			rowsUpdated: 0,
			durationMs: 25,
		});
	});

	it('queues by default and returns a status handle', async () => {
		const { POST } = await import('./+server.js');
		const request = new Request('http://localhost/api/codebase-index/deep-research', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ maxClusters: 1, resultsPerQuery: 1 }),
		});

		const response = await POST({ request, locals: { user: { id: 'u1' } } } as any);
		expect(response.status).toBe(202);

		const body = await response.json();
		expect(body).toMatchObject({
			ok: true,
			deferred: true,
			status: 'queued',
		});
		expect(typeof body.jobId).toBe('string');
		expect(body.statusUrl).toContain(body.jobId);
		expect(body.eventsUrl).toContain(body.jobId);
		expect(mockRunDeepResearchIndex).toHaveBeenCalledWith(
			expect.objectContaining({
				runId: body.jobId,
				maxClusters: 1,
				resultsPerQuery: 1,
				maxPages: 25,
				contentCharBudget: 4000,
			})
		);
	});

	it('supports synchronous wait mode for smoke checks', async () => {
		const { POST } = await import('./+server.js');
		const request = new Request('http://localhost/api/codebase-index/deep-research', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ mode: 'wait', maxClusters: 1, resultsPerQuery: 1, maxPages: 5 }),
		});

		const response = await POST({ request, locals: { user: { id: 'u1' } } } as any);
		expect(response.status).toBe(200);

		const body = await response.json();
		expect(body).toMatchObject({
			ok: true,
			queriesRun: 1,
			pagesIndexed: 1,
			rowsInserted: 1,
		});
		expect(mockRunDeepResearchIndex).toHaveBeenCalledWith(
			expect.objectContaining({
				maxPages: 5,
				childLinksPerPage: 2,
				contentCharBudget: 4000,
				runMaintenance: false,
			})
		);
	});

	it('returns job status by jobId', async () => {
		const { POST, GET } = await import('./+server.js');
		const request = new Request('http://localhost/api/codebase-index/deep-research', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ maxClusters: 1, resultsPerQuery: 1 }),
		});

		const postResponse = await POST({ request, locals: { user: { id: 'u1' } } } as any);
		const body = await postResponse.json();

		const statusResponse = await GET({
			url: new URL(`http://localhost/api/codebase-index/deep-research?jobId=${body.jobId}`),
			locals: { user: { id: 'u1' } },
		} as any);

		expect(statusResponse.status).toBe(200);
		const status = await statusResponse.json();
		expect(status.jobId).toBe(body.jobId);
		expect(['queued', 'running', 'done']).toContain(status.status);
	});
});
