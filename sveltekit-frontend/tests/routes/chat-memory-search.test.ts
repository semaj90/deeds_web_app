// @vitest-environment node
/**
 * Unit tests for /api/chat/memory/search
 *
 * Two branches share a single GET handler:
 *   - ?stats=1 → collection stats from Qdrant + recent sessions from Postgres
 *   - ?q=...   → embed via Ollama, then recallPastChats(embedding, opts)
 *
 * Cases covered:
 *  - 403 non-admin (both branches)
 *  - 400 missing / oversize q
 *  - 400 out-of-range scoreThreshold and limit
 *  - 503 when Ollama embedding fails
 *  - 200 success — includes hits, timings, echoed params
 *  - 200 stats — merges Qdrant collection info + Postgres recent sessions
 *  - Degraded: Qdrant 5xx on stats returns error shape (200 OK)
 *  - Degraded: Postgres throw returns recentSessions = []
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$lib/server/env.server.js', () => ({
	ENV: {
		QDRANT_URL: 'http://localhost:6333',
		OLLAMA_BASE_URL: 'http://localhost:11434',
	},
}));

const { mockRecallPastChats, mockDbExecute } = vi.hoisted(() => ({
	mockRecallPastChats: vi.fn(),
	mockDbExecute: vi.fn(),
}));

vi.mock('$lib/server/ace/chat-memory.js', () => ({
	recallPastChats: (...args: unknown[]) => mockRecallPastChats(...args),
}));

vi.mock('$lib/server/db/client', () => ({
	db: { execute: (...args: unknown[]) => mockDbExecute(...args) },
}));

import { makeAuthEvent, makeEvent, responseJson } from '../helpers/route-test-utils.js';

describe('/api/chat/memory/search', () => {
	let fetchSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.clearAllMocks();
		fetchSpy = vi.spyOn(global, 'fetch');
		// Default: Postgres returns zero recent sessions
		mockDbExecute.mockResolvedValue({ rows: [] });
	});

	afterEach(() => {
		fetchSpy.mockRestore();
	});

	// ── Auth ───────────────────────────────────────────────────────────────

	it('returns 403 for anonymous user', async () => {
		const { GET } = await import(
			'../../src/routes/api/chat/memory/search/+server.js'
		);
		const event = makeEvent({ url: '/api/chat/memory/search?q=test' });
		const res = await GET(event as any);
		expect(res.status).toBe(403);
	});

	it('returns 403 for non-admin role', async () => {
		const { GET } = await import(
			'../../src/routes/api/chat/memory/search/+server.js'
		);
		const event = makeAuthEvent({
			url: '/api/chat/memory/search?q=test',
			role: 'user',
		});
		const res = await GET(event as any);
		expect(res.status).toBe(403);
	});

	// ── Validation ─────────────────────────────────────────────────────────

	it('returns 400 when q is missing', async () => {
		const { GET } = await import(
			'../../src/routes/api/chat/memory/search/+server.js'
		);
		const event = makeAuthEvent({ url: '/api/chat/memory/search' });
		const res = await GET(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 400 when q exceeds 500 chars', async () => {
		const { GET } = await import(
			'../../src/routes/api/chat/memory/search/+server.js'
		);
		const event = makeAuthEvent({
			url: `/api/chat/memory/search?q=${'x'.repeat(501)}`,
		});
		const res = await GET(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 400 when scoreThreshold > 1', async () => {
		const { GET } = await import(
			'../../src/routes/api/chat/memory/search/+server.js'
		);
		const event = makeAuthEvent({
			url: '/api/chat/memory/search?q=hi&scoreThreshold=1.5',
		});
		const res = await GET(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 400 when limit > 20', async () => {
		const { GET } = await import(
			'../../src/routes/api/chat/memory/search/+server.js'
		);
		const event = makeAuthEvent({
			url: '/api/chat/memory/search?q=hi&limit=999',
		});
		const res = await GET(event as any);
		expect(res.status).toBe(400);
	});

	// ── Happy path ─────────────────────────────────────────────────────────

	it('returns 503 when embedding service fails', async () => {
		fetchSpy.mockResolvedValue(new Response('boom', { status: 503 }));

		const { GET } = await import(
			'../../src/routes/api/chat/memory/search/+server.js'
		);
		const event = makeAuthEvent({ url: '/api/chat/memory/search?q=hello' });
		const res = await GET(event as any);
		expect(res.status).toBe(503);
	});

	it('returns 200 with hits, timings, and echoed params on happy path', async () => {
		fetchSpy.mockResolvedValue(
			new Response(
				JSON.stringify({ embedding: Array.from({ length: 768 }, () => 0.1) }),
				{ status: 200 },
			),
		);

		mockRecallPastChats.mockResolvedValue([
			{
				id: 123,
				sessionId: 's1',
				role: 'user',
				content: 'Explain hearsay.',
				timestamp: 1_700_000_000_000,
				score: 0.89,
			},
		]);

		const { GET } = await import(
			'../../src/routes/api/chat/memory/search/+server.js'
		);
		const event = makeAuthEvent({
			url: '/api/chat/memory/search?q=hearsay&scoreThreshold=0.6&limit=5&excludeSessionId=sx',
		});
		const res = await GET(event as any);

		expect(res.status).toBe(200);
		const body = await responseJson<{
			query: string;
			hits: unknown[];
			timings: { embedMs: number; recallMs: number; totalMs: number };
			params: { scoreThreshold: number; limit: number; excludeSessionId: string | null };
		}>(res);

		expect(body.query).toBe('hearsay');
		expect(body.hits).toHaveLength(1);
		expect(body.params).toEqual({
			scoreThreshold: 0.6,
			limit: 5,
			excludeSessionId: 'sx',
		});
		expect(body.timings.embedMs).toBeGreaterThanOrEqual(0);
		expect(body.timings.recallMs).toBeGreaterThanOrEqual(0);

		// recallPastChats received the coerced numeric params
		expect(mockRecallPastChats).toHaveBeenCalledTimes(1);
		const [, opts] = mockRecallPastChats.mock.calls[0];
		expect(opts).toMatchObject({
			scoreThreshold: 0.6,
			limit: 5,
			excludeSessionId: 'sx',
		});
	});

	it('applies default threshold (0.3) and limit (10) when omitted', async () => {
		fetchSpy.mockResolvedValue(
			new Response(
				JSON.stringify({ embedding: Array.from({ length: 768 }, () => 0.1) }),
				{ status: 200 },
			),
		);
		mockRecallPastChats.mockResolvedValue([]);

		const { GET } = await import(
			'../../src/routes/api/chat/memory/search/+server.js'
		);
		const event = makeAuthEvent({ url: '/api/chat/memory/search?q=hi' });
		const res = await GET(event as any);

		expect(res.status).toBe(200);
		const [, opts] = mockRecallPastChats.mock.calls[0];
		expect(opts.scoreThreshold).toBe(0.3);
		expect(opts.limit).toBe(10);
	});

	// ── Stats branch ──────────────────────────────────────────────────────

	it('stats branch returns Qdrant collection info + recent sessions', async () => {
		fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.endsWith('/collections/chat_messages')) {
				return new Response(
					JSON.stringify({
						result: {
							points_count: 51,
							indexed_vectors_count: 50,
							status: 'green',
							config: {
								params: {
									vectors: { message: { size: 768 } },
								},
							},
						},
					}),
					{ status: 200 },
				);
			}
			if (url.includes('/points/scroll')) {
				return new Response(
					JSON.stringify({
						result: {
							points: [
								{
									payload: {
										sessionId: 'sess-1',
										role: 'user',
										content: 'hello world',
										timestamp: 1_700_000,
									},
								},
							],
						},
					}),
					{ status: 200 },
				);
			}
			throw new Error(`unexpected fetch: ${url}`);
		});

		mockDbExecute.mockResolvedValue({
			rows: [
				{
					chat_id: 'chat-abc',
					title: 'Hearsay analysis',
					last_message_at: new Date('2026-04-01T10:00:00Z'),
					message_count: '47',
				},
			],
		});

		const { GET } = await import(
			'../../src/routes/api/chat/memory/search/+server.js'
		);
		const event = makeAuthEvent({
			url: '/api/chat/memory/search?stats=1',
			userId: '11111111-1111-1111-1111-111111111111',
		});
		const res = await GET(event as any);

		expect(res.status).toBe(200);
		const body = await responseJson<{
			pointsCount: number;
			indexedVectorsCount: number;
			status: string;
			vectorDim: number | null;
			vectorName: string | null;
			sampleRecent: Array<{ sessionId: string }>;
			recentSessions: Array<{ chatId: string; title: string | null; messageCount: number }>;
		}>(res);

		expect(body.pointsCount).toBe(51);
		expect(body.indexedVectorsCount).toBe(50);
		expect(body.status).toBe('green');
		expect(body.vectorName).toBe('message');
		expect(body.vectorDim).toBe(768);
		expect(body.sampleRecent[0].sessionId).toBe('sess-1');
		expect(body.recentSessions).toHaveLength(1);
		expect(body.recentSessions[0]).toMatchObject({
			chatId: 'chat-abc',
			title: 'Hearsay analysis',
			messageCount: 47,
		});
	});

	it('stats branch returns error shape when Qdrant is unreachable (still 200)', async () => {
		fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'));

		const { GET } = await import(
			'../../src/routes/api/chat/memory/search/+server.js'
		);
		const event = makeAuthEvent({
			url: '/api/chat/memory/search?stats=1',
			userId: '11111111-1111-1111-1111-111111111111',
		});
		const res = await GET(event as any);

		expect(res.status).toBe(200);
		const body = await responseJson<{ error?: string; recentSessions?: unknown[] }>(res);
		expect(body.error).toBeDefined();
		// recentSessions still present (from the separate Postgres call)
		expect(Array.isArray(body.recentSessions)).toBe(true);
	});

	it('stats branch returns empty recentSessions when Postgres throws', async () => {
		fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.endsWith('/collections/chat_messages')) {
				return new Response(
					JSON.stringify({
						result: {
							points_count: 0,
							indexed_vectors_count: 0,
							status: 'green',
							config: { params: { vectors: {} } },
						},
					}),
					{ status: 200 },
				);
			}
			return new Response(JSON.stringify({ result: { points: [] } }), { status: 200 });
		});

		mockDbExecute.mockRejectedValue(new Error('ECONNREFUSED'));

		const { GET } = await import(
			'../../src/routes/api/chat/memory/search/+server.js'
		);
		const event = makeAuthEvent({
			url: '/api/chat/memory/search?stats=1',
			userId: '11111111-1111-1111-1111-111111111111',
		});
		const res = await GET(event as any);

		expect(res.status).toBe(200);
		const body = await responseJson<{ recentSessions: unknown[] }>(res);
		expect(body.recentSessions).toEqual([]);
	});

	it('stats branch does not query Postgres when locals.user.id is missing', async () => {
		fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.endsWith('/collections/chat_messages')) {
				return new Response(
					JSON.stringify({
						result: {
							points_count: 0,
							indexed_vectors_count: 0,
							status: 'green',
							config: { params: { vectors: {} } },
						},
					}),
					{ status: 200 },
				);
			}
			return new Response(JSON.stringify({ result: { points: [] } }), { status: 200 });
		});

		const { GET } = await import(
			'../../src/routes/api/chat/memory/search/+server.js'
		);
		// Admin role but no userId — recentSessions should short-circuit to []
		const event = makeEvent({
			url: '/api/chat/memory/search?stats=1',
			locals: { user: { role: 'admin', id: null } },
		});
		const res = await GET(event as any);

		expect(res.status).toBe(200);
		const body = await responseJson<{ recentSessions: unknown[] }>(res);
		expect(body.recentSessions).toEqual([]);
		expect(mockDbExecute).not.toHaveBeenCalled();
	});
});
