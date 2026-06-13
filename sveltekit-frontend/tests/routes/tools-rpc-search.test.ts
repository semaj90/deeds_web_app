// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Qdrant manager and dependencies
const mockQdrantClient = {
	search: vi.fn(),
};

const mockEnv = {
	OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
};

vi.mock('$lib/server/vector/qdrant-manager.js', () => ({
	qdrant: {
		client: mockQdrantClient,
	},
}));

vi.mock('$lib/server/env.server.js', () => ({
	ENV: mockEnv,
}));

describe('POST /api/tools/rpc-search', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns empty list when user not authenticated', async () => {
		const { POST } = await import('../../src/routes/api/tools/rpc-search/+server.js');

		const request = new Request('http://localhost/api/tools/rpc-search', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query: 'session validation' }),
		});

		const response = await POST({
			request,
			locals: { user: null },
		} as any);

		const data = await response.json();
		expect(data.tools).toEqual([]);
		expect(data.total).toBe(0);
		expect(typeof data.latency_ms).toBe('number');
	});

	it('returns 400-like degraded response on invalid JSON', async () => {
		const { POST } = await import('../../src/routes/api/tools/rpc-search/+server.js');

		const request = new Request('http://localhost/api/tools/rpc-search', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: 'invalid json',
		});

		const response = await POST({
			request,
			locals: { user: { id: 1 } },
		} as any);

		const data = await response.json();
		expect(data.tools).toEqual([]);
		expect(data.total).toBe(0);
		expect(typeof data.latency_ms).toBe('number');
	});

	it('returns valid response with mcp_agents filter when query provided', async () => {
		const { POST } = await import('../../src/routes/api/tools/rpc-search/+server.js');

		// Mock successful Qdrant search
		mockQdrantClient.search.mockResolvedValue([
			{
				id: 'point-1',
				score: 0.87,
				payload: {
					packet_key: 'grpc:LuciaService.ValidateSession',
					summary: 'Validate Lucia session token',
					qdrant_tags: ['grpc', 'auth', 'session'],
					domain_class: 'mcp_agents',
				},
			},
			{
				id: 'point-2',
				score: 0.76,
				payload: {
					packet_key: 'grpc:AuthService.Login',
					summary: 'User login endpoint',
					qdrant_tags: ['grpc', 'auth', 'login'],
					domain_class: 'mcp_agents',
				},
			},
		]);

		// Mock embedding call
		global.fetch = vi.fn(async (url: string, opts: any) => {
			if (typeof url === 'string' && url.includes('/api/embeddings')) {
				return new Response(
					JSON.stringify({
						embedding: new Array(768).fill(0.5),
					}),
					{ status: 200 }
				);
			}
			return new Response('Not found', { status: 404 });
		});

		const request = new Request('http://localhost/api/tools/rpc-search', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query: 'session validation', limit: 20 }),
		});

		const response = await POST({
			request,
			locals: { user: { id: 1 } },
		} as any);

		const data = await response.json();
		expect(data.tools).toHaveLength(2);
		expect(data.total).toBe(2);
		expect(data.tools[0].packet_key).toBe('grpc:LuciaService.ValidateSession');
		expect(data.tools[0].summary).toBe('Validate Lucia session token');
		expect(data.tools[0].confidence).toBe(0.87);
		expect(data.tools[0].tags).toContain('auth');
		expect(typeof data.latency_ms).toBe('number');
	});

	it('filters by feature_id when provided', async () => {
		const { POST } = await import('../../src/routes/api/tools/rpc-search/+server.js');

		mockQdrantClient.search.mockResolvedValue([]);

		const request = new Request('http://localhost/api/tools/rpc-search', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				query: 'auth',
				feature_id: 'auth.sessions',
				limit: 15,
			}),
		});

		const response = await POST({
			request,
			locals: { user: { id: 1 } },
		} as any);

		const data = await response.json();

		// Verify Qdrant was called with feature_id filter
		expect(mockQdrantClient.search).toHaveBeenCalled();
		const callArgs = mockQdrantClient.search.mock.calls[0][1];
		expect(callArgs.filter.must).toContainEqual({ key: 'domain_class', match: { value: 'mcp_agents' } });
		expect(callArgs.filter.must).toContainEqual({ key: 'feature_id', match: { value: 'auth.sessions' } });

		expect(data.tools).toEqual([]);
		expect(data.total).toBe(0);
	});

	it('falls back to filter-only mode when embedding fails', async () => {
		const { POST } = await import('../../src/routes/api/tools/rpc-search/+server.js');

		mockQdrantClient.search.mockResolvedValue([
			{
				id: 'point-1',
				score: 0.5,
				payload: {
					packet_key: 'grpc:SearchService.Query',
					summary: 'Query search',
					qdrant_tags: ['search'],
					domain_class: 'mcp_agents',
				},
			},
		]);

		// Mock embedding call to fail
		global.fetch = vi.fn(async () => {
			return new Response('Embedding service unavailable', { status: 503 });
		});

		const request = new Request('http://localhost/api/tools/rpc-search', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query: 'search' }),
		});

		const response = await POST({
			request,
			locals: { user: { id: 1 } },
		} as any);

		const data = await response.json();
		expect(data.tools).toHaveLength(1);
		expect(data.total).toBe(1);
		// Verify dummy vector was used (filter-only mode)
		const callArgs = mockQdrantClient.search.mock.calls[0][1];
		expect(callArgs.vector).toBeDefined();
	});

	it('returns degraded response on Qdrant error', async () => {
		const { POST } = await import('../../src/routes/api/tools/rpc-search/+server.js');

		mockQdrantClient.search.mockRejectedValue(new Error('Qdrant timeout'));

		const request = new Request('http://localhost/api/tools/rpc-search', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query: 'test' }),
		});

		const response = await POST({
			request,
			locals: { user: { id: 1 } },
		} as any);

		const data = await response.json();
		expect(data.tools).toEqual([]);
		expect(data.total).toBe(0);
		expect(response.status).toBe(200); // Degraded response, not 500
	});

	it('respects limit parameter (max 50)', async () => {
		const { POST } = await import('../../src/routes/api/tools/rpc-search/+server.js');

		mockQdrantClient.search.mockResolvedValue([]);

		const request = new Request('http://localhost/api/tools/rpc-search', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query: 'test', limit: 100 }), // Will be clamped to 50
		});

		const response = await POST({
			request,
			locals: { user: { id: 1 } },
		} as any);

		const callArgs = mockQdrantClient.search.mock.calls[0][1];
		expect(callArgs.limit).toBe(50); // Should be clamped to max
	});

	it('returns tools with all required fields', async () => {
		const { POST } = await import('../../src/routes/api/tools/rpc-search/+server.js');

		mockQdrantClient.search.mockResolvedValue([
			{
				id: 'test-id',
				score: 0.9,
				payload: {
					packet_key: 'test:Key',
					summary: 'Test summary',
					qdrant_tags: ['tag1', 'tag2'],
				},
			},
		]);

		const request = new Request('http://localhost/api/tools/rpc-search', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query: 'test' }),
		});

		const response = await POST({
			request,
			locals: { user: { id: 1 } },
		} as any);

		const data = await response.json();
		const tool = data.tools[0];

		// Verify all required fields exist
		expect(tool).toHaveProperty('packet_key');
		expect(tool).toHaveProperty('summary');
		expect(tool).toHaveProperty('tags');
		expect(tool).toHaveProperty('confidence');

		// Verify types
		expect(typeof tool.packet_key).toBe('string');
		expect(typeof tool.summary).toBe('string');
		expect(Array.isArray(tool.tags)).toBe(true);
		expect(typeof tool.confidence).toBe('number');
	});
});
