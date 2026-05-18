// @vitest-environment node
/**
 * Unit tests for GET /api/codebase-index/export/bundle
 *
 * Covers:
 *   - 401 unauthenticated
 *   - 302 redirect when ?format=ipynb
 *   - 200 success with all 6 parts (graph, clusters, wikiNotes, manifold4,
 *     tileAtlas, cacheStats)
 *   - 200 selective include (?include=clusters,wikiNotes) — unrequested
 *     parts are null
 *   - 200 degraded: when one source (Postgres/Redis/Qdrant) throws, its
 *     part is null, meta.errors names it, meta.sources flags false, other
 *     parts still return
 *   - Shape parity between success and degraded responses
 *
 * Pattern: G26 lazy-import — vi.hoisted() for mocks, handler imported
 * inside each test after mock setup.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── hoisted mocks ─────────────────────────────────────────────────────────────

const { mockDbExecute, mockFetch, mockIORedisCtor, mockRedisInstance } = vi.hoisted(() => {
	const mockRedisInstance = {
		scan: vi.fn(),
		mget: vi.fn(),
		get: vi.fn(),
		set: vi.fn(),
		setex: vi.fn(),
		hget: vi.fn(),
		hgetall: vi.fn(),
		disconnect: vi.fn(),
		quit: vi.fn().mockResolvedValue('OK'),
		on: vi.fn(),
	};
	const mockIORedisCtor = vi.fn(() => mockRedisInstance);
	return {
		mockDbExecute: vi.fn(),
		mockFetch: vi.fn(),
		mockIORedisCtor,
		mockRedisInstance
	};
});

// ── module mocks ──────────────────────────────────────────────────────────────

vi.mock('$lib/server/db/client', () => ({
	db: { execute: mockDbExecute }
}));

vi.mock('ioredis', () => ({
	default: mockIORedisCtor
}));

vi.mock('$lib/server/env.server.js', () => ({
	ENV: {
		QDRANT_URL: 'http://localhost:6333'
	}
}));

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

// ── helpers ───────────────────────────────────────────────────────────────────

function makeEvent(
	params: Record<string, string> = {},
	userId: string | null = 'user-1'
): Parameters<
	typeof import('../../src/routes/api/codebase-index/export/bundle/+server.js').GET
>[0] {
	const url = new URL('http://localhost:5173/api/codebase-index/export/bundle');
	for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
	return {
		url,
		locals: { user: userId ? { id: userId } : null }
	} as unknown as Parameters<
		typeof import('../../src/routes/api/codebase-index/export/bundle/+server.js').GET
	>[0];
}

function mockNodeRows(count: number) {
	return Array.from({ length: count }, (_, i) => ({
		id: `q-${i}`,
		path: `src/lib/mod-${i}.ts`,
		gpu_cluster: i % 5,
		som_cluster: i % 3,
		page_rank_score: 0.5 + i * 0.01,
		semantic_tags: ['typescript', `tag-${i}`]
	}));
}

function mockClusterRows(count: number) {
	return Array.from({ length: count }, (_, i) => ({
		gpu_cluster: i,
		purpose: `Cluster ${i} purpose`,
		patterns: ['pattern-a', 'pattern-b'],
		warnings: i === 0 ? ['warning-0'] : [],
		tags: ['tag-x'],
		member_count: 100 - i,
		has_embedding: i < 3
	}));
}

function mockManifoldRows(count: number) {
	return Array.from({ length: count }, (_, i) => ({
		id: `q-${i}`,
		som_cluster: i % 3,
		gpu_cluster: i % 5,
		page_rank_score: 0.5 + i * 0.01,
		community_id: i % 2
	}));
}

beforeEach(() => {
	vi.clearAllMocks();
	// Default: Redis SCAN returns empty (cursor=0, keys=[])
	mockRedisInstance.scan.mockResolvedValue(['0', []]);
	mockRedisInstance.mget.mockResolvedValue([]);
	// Default: global fetch returns a healthy Qdrant collection
	mockFetch.mockResolvedValue({
		ok: true,
		status: 200,
		json: () => Promise.resolve({ result: { points_count: 196 } })
	} as unknown as Response);
	globalThis.fetch = mockFetch as unknown as typeof fetch;
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/codebase-index/export/bundle', () => {
	it('returns 401 when unauthenticated', async () => {
		const { GET } = await import(
			'../../src/routes/api/codebase-index/export/bundle/+server.js'
		);
		const res = await GET(makeEvent({}, null));
		expect(res.status).toBe(401);
	});

	it('redirects to /api/graph/colab-export when format=ipynb', async () => {
		const { GET } = await import(
			'../../src/routes/api/codebase-index/export/bundle/+server.js'
		);
		// SvelteKit's redirect() throws — catch and inspect
		try {
			await GET(makeEvent({ format: 'ipynb' }));
			throw new Error('expected redirect throw');
		} catch (err) {
			const r = err as { status?: number; location?: string };
			expect(r.status).toBe(302);
			expect(r.location).toBe('/api/graph/colab-export');
		}
	});

	it('returns all 6 parts with meta.sources=true on success', async () => {
		// Three SQL queries run in parallel via Promise.all, so order isn't stable.
		// Dispatch by query content instead — each projection has a unique column:
		//   buildGraphPart    → codebase_chunk_index with relative_path
		//   buildClustersPart → cluster_summaries
		//   buildManifold4Part→ codebase_chunk_index with community_id
		mockDbExecute.mockImplementation((query: unknown) => {
			const s = JSON.stringify(query);
			if (s.includes('cluster_summaries')) {
				return Promise.resolve({ rows: mockClusterRows(3) });
			}
			if (s.includes('community_id')) {
				return Promise.resolve({ rows: mockManifoldRows(5) });
			}
			// Default: graph part (codebase_chunk_index with relative_path)
			return Promise.resolve({ rows: mockNodeRows(5) });
		});

		const { GET } = await import(
			'../../src/routes/api/codebase-index/export/bundle/+server.js'
		);
		const res = await GET(makeEvent({ limit: '50' }));
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;

		expect(body).toHaveProperty('graph');
		expect(body).toHaveProperty('clusters');
		expect(body).toHaveProperty('wikiNotes');
		expect(body).toHaveProperty('manifold4');
		expect(body).toHaveProperty('tileAtlas');
		expect(body).toHaveProperty('cacheStats');
		expect(body).toHaveProperty('meta');

		const meta = body.meta as Record<string, unknown>;
		const sources = meta.sources as Record<string, boolean>;
		expect(sources.graph).toBe(true);
		expect(sources.clusters).toBe(true);
		expect(sources.wikiNotes).toBe(true);
		expect(sources.manifold4).toBe(true);
		expect(sources.tileAtlas).toBe(true);
		expect(sources.cacheStats).toBe(true);

		const graph = body.graph as { nodes: unknown[]; edges: unknown[] };
		expect(graph.nodes).toHaveLength(5);
		expect(graph.edges.length).toBeGreaterThan(0);

		const clusters = body.clusters as unknown[];
		expect(clusters).toHaveLength(3);
	});

	it('selective include returns nulls for omitted parts', async () => {
		mockDbExecute.mockResolvedValue({ rows: mockClusterRows(2) });

		const { GET } = await import(
			'../../src/routes/api/codebase-index/export/bundle/+server.js'
		);
		const res = await GET(makeEvent({ include: 'clusters' }));
		const body = (await res.json()) as Record<string, unknown>;

		expect(body.graph).toBeNull();
		expect(body.manifold4).toBeNull();
		expect(body.tileAtlas).toBeNull();
		expect(body.cacheStats).toBeNull();
		expect(body.wikiNotes).toBeNull();
		expect(body.clusters).not.toBeNull();
		expect((body.clusters as unknown[]).length).toBe(2);
	});

	it('degrades gracefully: Postgres failure → graph/clusters/manifold4 null, Redis/Qdrant still return', async () => {
		mockDbExecute.mockRejectedValue(new Error('connection refused'));

		const { GET } = await import(
			'../../src/routes/api/codebase-index/export/bundle/+server.js'
		);
		const res = await GET(makeEvent({}));
		expect(res.status).toBe(200); // degraded shape, same status
		const body = (await res.json()) as Record<string, unknown>;

		// Postgres-backed parts are null
		expect(body.graph).toBeNull();
		expect(body.clusters).toBeNull();
		expect(body.manifold4).toBeNull();

		// Redis + Qdrant parts still return
		expect(body.wikiNotes).not.toBeNull();
		expect(body.tileAtlas).not.toBeNull();
		expect(body.cacheStats).not.toBeNull();

		const meta = body.meta as Record<string, unknown>;
		const sources = meta.sources as Record<string, boolean>;
		expect(sources.graph).toBe(false);
		expect(sources.clusters).toBe(false);
		expect(sources.manifold4).toBe(false);
		expect(sources.wikiNotes).toBe(true);

		const errors = meta.errors as Record<string, string>;
		expect(errors).toHaveProperty('graph');
		expect(errors).toHaveProperty('clusters');
		expect(errors).toHaveProperty('manifold4');
	});

	it('maintains key-set parity between success and degraded responses', async () => {
		// Success
		mockDbExecute.mockResolvedValue({ rows: [] });
		const { GET } = await import(
			'../../src/routes/api/codebase-index/export/bundle/+server.js'
		);
		const okRes = await GET(makeEvent({}));
		const okBody = (await okRes.json()) as Record<string, unknown>;
		const okKeys = Object.keys(okBody).sort();

		// Degraded (all backends fail)
		vi.clearAllMocks();
		mockDbExecute.mockRejectedValue(new Error('db down'));
		mockRedisInstance.scan.mockRejectedValue(new Error('redis down'));
		mockFetch.mockRejectedValue(new Error('qdrant down'));

		const degRes = await GET(makeEvent({}));
		const degBody = (await degRes.json()) as Record<string, unknown>;
		const degKeys = Object.keys(degBody).sort();

		// Clients can destructure either response identically
		expect(degKeys).toEqual(okKeys);
		expect(degRes.status).toBe(200);
	});

	it('wikiNotes scan uses wiki:note:* pattern and parses JSON values', async () => {
		mockDbExecute.mockResolvedValue({ rows: [] });
		mockRedisInstance.scan
			.mockResolvedValueOnce(['0', ['wiki:note:cluster:gpu:0', 'wiki:note:playbook:ace']])
			.mockResolvedValue(['0', []]);
		mockRedisInstance.mget.mockResolvedValueOnce([
			JSON.stringify({ type: 'cluster', clusterId: 0, body: 'summary' }),
			JSON.stringify({ type: 'playbook', domain: 'ace' })
		]);

		const { GET } = await import(
			'../../src/routes/api/codebase-index/export/bundle/+server.js'
		);
		const res = await GET(makeEvent({ include: 'wikiNotes' }));
		const body = (await res.json()) as Record<string, unknown>;

		const notes = body.wikiNotes as Array<{ id: string; type: string; body: unknown }>;
		expect(notes).toHaveLength(2);
		expect(notes[0].id).toBe('wiki:note:cluster:gpu:0');
		expect(notes[0].type).toBe('cluster');
		expect(notes[1].type).toBe('playbook');

		// Verify SCAN was called with the wiki:note:* pattern
		expect(mockRedisInstance.scan).toHaveBeenCalledWith(
			expect.any(String),
			'MATCH',
			'wiki:note:*',
			'COUNT',
			200
		);
	});
});
