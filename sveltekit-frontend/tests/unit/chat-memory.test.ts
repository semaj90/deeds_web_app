// @vitest-environment node
/**
 * Unit tests for src/lib/server/ace/chat-memory.ts
 *
 * Covers the three primary concerns of the chat memory recall layer:
 *
 *   1. Settings gate — when the admin toggle is off (`enabled: false`), recall
 *      short-circuits WITHOUT hitting Qdrant or embedding the query. This is
 *      load-bearing: disabling recall must not waste a network round-trip.
 *
 *   2. Metrics — every recallPastChats call increments rolling counters in
 *      Redis (calls, hits, failures, latency, score). The admin observability
 *      panel reads these. If the increment stops happening, the dashboard
 *      silently stops updating — tests guard against that regression.
 *
 *   3. Qdrant payload mapping — Qdrant returns raw shape; recallPastChats
 *      filters out points missing content/sessionId and reshapes into the
 *      RecalledChatMessage contract consumers depend on.
 *
 * The ID hash (hashToQdrantId) is tested separately because it must be
 * stable across runs: live writes and the backfill path derive the same
 * numeric id from the same Postgres row id, otherwise backfill would create
 * duplicates.
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

const { mockGetRedis } = vi.hoisted(() => ({ mockGetRedis: vi.fn() }));

vi.mock('$lib/server/redis.js', () => ({
	getRedis: (...args: unknown[]) => mockGetRedis(...args),
}));

function makeRedis(overrides: Partial<{
	get: (key: string) => Promise<string | null>;
	hgetall: (key: string) => Promise<Record<string, string>>;
	del: (key: string) => Promise<number>;
	pipeline: () => {
		hincrby: (...args: unknown[]) => unknown;
		hincrbyfloat: (...args: unknown[]) => unknown;
		exec: () => Promise<unknown>;
	};
}> = {}) {
	const pipelineCalls: unknown[][] = [];
	const pipelineFactory = overrides.pipeline ?? (() => {
		const chain = {
			hincrby: (...args: unknown[]) => { pipelineCalls.push(['hincrby', ...args]); return chain; },
			hincrbyfloat: (...args: unknown[]) => { pipelineCalls.push(['hincrbyfloat', ...args]); return chain; },
			exec: vi.fn(async () => []),
		};
		return chain;
	});

	return {
		get: vi.fn(async () => null),
		hgetall: vi.fn(async () => ({})),
		del: vi.fn(async () => 1),
		pipeline: pipelineFactory,
		_pipelineCalls: pipelineCalls,
		...overrides,
	};
}

describe('chat-memory: settings gate', () => {
	let fetchSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
		fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
			new Response(JSON.stringify({ result: [] }), { status: 200 })
		);
	});

	afterEach(() => {
		fetchSpy.mockRestore();
	});

	it('returns [] without calling Qdrant when settings.enabled=false', async () => {
		mockGetRedis.mockReturnValue(
			makeRedis({
				get: async () =>
					JSON.stringify({ enabled: false, scoreThreshold: 0.65 }),
			})
		);

		const { recallPastChats } = await import('$lib/server/ace/chat-memory.js');
		const embedding = Array.from({ length: 768 }, () => 0.1);

		const hits = await recallPastChats(embedding);

		expect(hits).toEqual([]);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('bypasses the enabled gate when caller passes an explicit scoreThreshold', async () => {
		// Admin-search-console usage: pass threshold to inspect even when off.
		mockGetRedis.mockReturnValue(
			makeRedis({
				get: async () =>
					JSON.stringify({ enabled: false, scoreThreshold: 0.65 }),
			})
		);

		fetchSpy.mockResolvedValue(
			new Response(
				JSON.stringify({
					result: [
						{
							id: 1,
							score: 0.9,
							payload: { sessionId: 's1', role: 'user', content: 'hi' },
						},
					],
				}),
				{ status: 200 }
			)
		);

		const { recallPastChats } = await import('$lib/server/ace/chat-memory.js');
		const embedding = Array.from({ length: 768 }, () => 0.1);

		const hits = await recallPastChats(embedding, { scoreThreshold: 0.3 });

		expect(hits).toHaveLength(1);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it('uses settings.scoreThreshold as default when caller omits it', async () => {
		mockGetRedis.mockReturnValue(
			makeRedis({
				get: async () =>
					JSON.stringify({ enabled: true, scoreThreshold: 0.82 }),
			})
		);

		fetchSpy.mockResolvedValue(
			new Response(JSON.stringify({ result: [] }), { status: 200 })
		);

		const { recallPastChats } = await import('$lib/server/ace/chat-memory.js');
		const embedding = Array.from({ length: 768 }, () => 0.1);

		await recallPastChats(embedding);

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [, init] = fetchSpy.mock.calls[0];
		const body = JSON.parse((init as RequestInit).body as string);
		expect(body.score_threshold).toBe(0.82);
	});

	it('returns [] for empty query embedding without any external calls', async () => {
		mockGetRedis.mockReturnValue(makeRedis());
		const { recallPastChats } = await import('$lib/server/ace/chat-memory.js');

		const hits = await recallPastChats([]);

		expect(hits).toEqual([]);
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});

describe('chat-memory: payload mapping', () => {
	let fetchSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
		fetchSpy = vi.spyOn(global, 'fetch');
		mockGetRedis.mockReturnValue(makeRedis());
	});

	afterEach(() => {
		fetchSpy.mockRestore();
	});

	it('reshapes Qdrant results into RecalledChatMessage', async () => {
		fetchSpy.mockResolvedValue(
			new Response(
				JSON.stringify({
					result: [
						{
							id: 42,
							score: 0.89,
							payload: {
								sessionId: 'abc123',
								role: 'assistant',
								content: 'Explain hearsay.',
								timestamp: 1_700_000_000_000,
							},
						},
					],
				}),
				{ status: 200 }
			)
		);

		const { recallPastChats } = await import('$lib/server/ace/chat-memory.js');
		const embedding = Array.from({ length: 768 }, () => 0.1);
		const hits = await recallPastChats(embedding, { scoreThreshold: 0.5 });

		expect(hits).toEqual([
			{
				id: 42,
				sessionId: 'abc123',
				role: 'assistant',
				content: 'Explain hearsay.',
				timestamp: 1_700_000_000_000,
				score: 0.89,
			},
		]);
	});

	it('filters out points missing content or sessionId', async () => {
		fetchSpy.mockResolvedValue(
			new Response(
				JSON.stringify({
					result: [
						{ id: 1, score: 0.9, payload: { sessionId: 's1', role: 'user', content: 'valid' } },
						{ id: 2, score: 0.85, payload: { role: 'user', content: 'no session' } }, // dropped
						{ id: 3, score: 0.8, payload: { sessionId: 's3' } }, // dropped (no content)
						{ id: 4, score: 0.75, payload: { sessionId: 's4', content: 'valid2' } }, // role defaults
					],
				}),
				{ status: 200 }
			)
		);

		const { recallPastChats } = await import('$lib/server/ace/chat-memory.js');
		const embedding = Array.from({ length: 768 }, () => 0.1);
		const hits = await recallPastChats(embedding, { scoreThreshold: 0.5 });

		expect(hits.map((h) => h.id)).toEqual([1, 4]);
		expect(hits[1].role).toBe('user'); // defaulted
	});

	it('returns [] on Qdrant 5xx', async () => {
		fetchSpy.mockResolvedValue(new Response('upstream boom', { status: 503 }));

		const { recallPastChats } = await import('$lib/server/ace/chat-memory.js');
		const embedding = Array.from({ length: 768 }, () => 0.1);
		const hits = await recallPastChats(embedding, { scoreThreshold: 0.5 });

		expect(hits).toEqual([]);
	});

	it('returns [] on fetch throw (network / timeout)', async () => {
		fetchSpy.mockRejectedValue(new Error('ETIMEDOUT'));

		const { recallPastChats } = await import('$lib/server/ace/chat-memory.js');
		const embedding = Array.from({ length: 768 }, () => 0.1);
		const hits = await recallPastChats(embedding, { scoreThreshold: 0.5 });

		expect(hits).toEqual([]);
	});

	it('applies excludeSessionId filter to the Qdrant request', async () => {
		fetchSpy.mockResolvedValue(
			new Response(JSON.stringify({ result: [] }), { status: 200 })
		);

		const { recallPastChats } = await import('$lib/server/ace/chat-memory.js');
		const embedding = Array.from({ length: 768 }, () => 0.1);
		await recallPastChats(embedding, {
			scoreThreshold: 0.5,
			excludeSessionId: 'current-session',
		});

		const [, init] = fetchSpy.mock.calls[0];
		const body = JSON.parse((init as RequestInit).body as string);
		expect(body.filter?.must_not).toContainEqual({
			key: 'sessionId',
			match: { value: 'current-session' },
		});
	});
});

describe('chat-memory: metrics', () => {
	let fetchSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
		fetchSpy = vi.spyOn(global, 'fetch');
	});

	afterEach(() => {
		fetchSpy.mockRestore();
	});

	it('records a hit with score totals on successful recall', async () => {
		const redis = makeRedis();
		mockGetRedis.mockReturnValue(redis);

		fetchSpy.mockResolvedValue(
			new Response(
				JSON.stringify({
					result: [
						{
							id: 1,
							score: 0.8,
							payload: { sessionId: 's1', role: 'user', content: 'hi' },
						},
						{
							id: 2,
							score: 0.75,
							payload: { sessionId: 's2', role: 'user', content: 'hello' },
						},
					],
				}),
				{ status: 200 }
			)
		);

		const { recallPastChats } = await import('$lib/server/ace/chat-memory.js');
		const embedding = Array.from({ length: 768 }, () => 0.1);
		await recallPastChats(embedding, { scoreThreshold: 0.5 });

		// Give fire-and-forget metric pipeline a chance to flush
		await new Promise((resolve) => setTimeout(resolve, 10));

		const calls = (redis as any)._pipelineCalls;
		const callsOp = calls.find((c: unknown[]) => c[2] === 'calls');
		const hitsOp = calls.find((c: unknown[]) => c[2] === 'hits');
		const scoreOp = calls.find((c: unknown[]) => c[2] === 'scoreTotal');

		expect(callsOp?.[3]).toBe(1);
		expect(hitsOp?.[3]).toBe(2);
		expect(scoreOp?.[3]).toBeCloseTo(1.55, 2); // 0.8 + 0.75
	});

	it('records a failure when Qdrant fails', async () => {
		const redis = makeRedis();
		mockGetRedis.mockReturnValue(redis);

		fetchSpy.mockResolvedValue(new Response('boom', { status: 500 }));

		const { recallPastChats } = await import('$lib/server/ace/chat-memory.js');
		const embedding = Array.from({ length: 768 }, () => 0.1);
		await recallPastChats(embedding, { scoreThreshold: 0.5 });

		await new Promise((resolve) => setTimeout(resolve, 10));

		const calls = (redis as any)._pipelineCalls;
		const failureOp = calls.find((c: unknown[]) => c[2] === 'failures');

		expect(failureOp?.[3]).toBe(1);
	});

	it('does NOT record metrics when the settings gate short-circuits', async () => {
		const redis = makeRedis({
			get: async () =>
				JSON.stringify({ enabled: false, scoreThreshold: 0.65 }),
		});
		mockGetRedis.mockReturnValue(redis);

		const { recallPastChats } = await import('$lib/server/ace/chat-memory.js');
		const embedding = Array.from({ length: 768 }, () => 0.1);
		await recallPastChats(embedding);

		await new Promise((resolve) => setTimeout(resolve, 10));

		// No recall happened, no metrics increment
		expect((redis as any)._pipelineCalls).toHaveLength(0);
	});

	it('readChatMemoryMetrics returns derived averages', async () => {
		mockGetRedis.mockReturnValue(
			makeRedis({
				hgetall: async () => ({
					calls: '200',
					hits: '50',
					failures: '5',
					latencyMsTotal: '8000',
					scoreTotal: '41.5',
				}),
			})
		);

		const { readChatMemoryMetrics } = await import(
			'$lib/server/ace/chat-memory.js'
		);
		const m = await readChatMemoryMetrics();

		expect(m.calls).toBe(200);
		expect(m.hits).toBe(50);
		expect(m.failures).toBe(5);
		expect(m.avgLatencyMs).toBe(40); // 8000/200
		expect(m.avgHitsPerCall).toBe(0.25); // 50/200
		expect(m.avgScore).toBeCloseTo(0.83, 2); // 41.5/50
	});

	it('readChatMemoryMetrics returns zeroes when Redis is unavailable', async () => {
		mockGetRedis.mockReturnValue(
			makeRedis({
				hgetall: async () => {
					throw new Error('ECONNREFUSED');
				},
			})
		);

		const { readChatMemoryMetrics } = await import(
			'$lib/server/ace/chat-memory.js'
		);
		const m = await readChatMemoryMetrics();

		expect(m).toEqual({
			calls: 0,
			hits: 0,
			failures: 0,
			avgLatencyMs: 0,
			avgHitsPerCall: 0,
			avgScore: 0,
		});
	});

	it('resetChatMemoryMetrics issues DEL on the metrics key', async () => {
		const del = vi.fn(async () => 1);
		mockGetRedis.mockReturnValue(makeRedis({ del }));

		const { resetChatMemoryMetrics } = await import(
			'$lib/server/ace/chat-memory.js'
		);
		const ok = await resetChatMemoryMetrics();

		expect(ok).toBe(true);
		expect(del).toHaveBeenCalledWith('chat_memory:metrics');
	});
});

describe('chat-memory: indexChatMessage', () => {
	let fetchSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
		mockGetRedis.mockReturnValue(makeRedis());
		fetchSpy = vi.spyOn(global, 'fetch');
	});

	afterEach(() => {
		fetchSpy.mockRestore();
	});

	it('PUTs to the chat_messages collection with the message named vector', async () => {
		fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));

		const { indexChatMessage } = await import('$lib/server/ace/chat-memory.js');
		const emb = Array.from({ length: 768 }, () => 0.1);

		const ok = await indexChatMessage(
			{ id: 42, sessionId: 's1', role: 'user', content: 'hello', timestamp: 1_700_000 },
			emb,
		);

		expect(ok).toBe(true);
		expect(fetchSpy).toHaveBeenCalledTimes(1);

		const [url, init] = fetchSpy.mock.calls[0];
		expect(String(url)).toBe('http://localhost:6333/collections/chat_messages/points');
		expect((init as RequestInit).method).toBe('PUT');

		const body = JSON.parse((init as RequestInit).body as string);
		expect(body.points).toHaveLength(1);
		expect(body.points[0].id).toBe(42);
		expect(body.points[0].vector).toEqual({ message: emb });
		expect(body.points[0].payload).toEqual({
			sessionId: 's1',
			role: 'user',
			content: 'hello',
			timestamp: 1_700_000,
		});
	});

	it('returns false for empty embedding without calling Qdrant', async () => {
		const { indexChatMessage } = await import('$lib/server/ace/chat-memory.js');
		const ok = await indexChatMessage(
			{ id: 1, sessionId: 's1', role: 'user', content: 'x' },
			[],
		);
		expect(ok).toBe(false);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('returns false for blank content without calling Qdrant', async () => {
		const { indexChatMessage } = await import('$lib/server/ace/chat-memory.js');
		const emb = Array.from({ length: 768 }, () => 0.1);
		const ok = await indexChatMessage(
			{ id: 1, sessionId: 's1', role: 'user', content: '   ' },
			emb,
		);
		expect(ok).toBe(false);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('returns false on Qdrant non-2xx (never throws)', async () => {
		fetchSpy.mockResolvedValue(new Response('boom', { status: 500 }));

		const { indexChatMessage } = await import('$lib/server/ace/chat-memory.js');
		const emb = Array.from({ length: 768 }, () => 0.1);
		const ok = await indexChatMessage(
			{ id: 1, sessionId: 's1', role: 'user', content: 'hi' },
			emb,
		);
		expect(ok).toBe(false);
	});

	it('returns false on fetch throw (network error)', async () => {
		fetchSpy.mockRejectedValue(new Error('ETIMEDOUT'));

		const { indexChatMessage } = await import('$lib/server/ace/chat-memory.js');
		const emb = Array.from({ length: 768 }, () => 0.1);
		const ok = await indexChatMessage(
			{ id: 1, sessionId: 's1', role: 'user', content: 'hi' },
			emb,
		);
		expect(ok).toBe(false);
	});
});

describe('chat-memory: recordChatMessageForRecall', () => {
	let fetchSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
		mockGetRedis.mockReturnValue(makeRedis());
		fetchSpy = vi.spyOn(global, 'fetch');
	});

	afterEach(() => {
		fetchSpy.mockRestore();
	});

	it('skips system-role messages without touching Ollama or Qdrant', async () => {
		const { recordChatMessageForRecall } = await import(
			'$lib/server/ace/chat-memory.js'
		);

		const ok = await recordChatMessageForRecall({
			id: 'msg_1',
			sessionId: 's1',
			role: 'system',
			content: 'You are a legal assistant.',
		});

		expect(ok).toBe(false);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('skips messages shorter than 8 chars', async () => {
		const { recordChatMessageForRecall } = await import(
			'$lib/server/ace/chat-memory.js'
		);

		const ok = await recordChatMessageForRecall({
			id: 'msg_1',
			sessionId: 's1',
			role: 'user',
			content: 'yes',
		});

		expect(ok).toBe(false);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('embeds via Ollama then upserts into Qdrant on happy path', async () => {
		const emb = Array.from({ length: 768 }, () => 0.42);

		fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('/api/embeddings')) {
				return new Response(JSON.stringify({ embedding: emb }), { status: 200 });
			}
			if (url.includes('/collections/chat_messages/points')) {
				return new Response('{}', { status: 200 });
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});

		const { recordChatMessageForRecall } = await import(
			'$lib/server/ace/chat-memory.js'
		);

		const ok = await recordChatMessageForRecall({
			id: 'msg_abc',
			sessionId: 's-xyz',
			role: 'user',
			content: 'Explain the elements of negligence per se.',
		});

		expect(ok).toBe(true);

		const ollamaCall = fetchSpy.mock.calls.find((c) =>
			String(c[0]).includes('/api/embeddings'),
		);
		const qdrantCall = fetchSpy.mock.calls.find((c) =>
			String(c[0]).includes('/collections/chat_messages/points'),
		);
		expect(ollamaCall).toBeDefined();
		expect(qdrantCall).toBeDefined();

		// Qdrant upsert uses hash of string id — numeric and deterministic
		const qdrantBody = JSON.parse((qdrantCall![1] as RequestInit).body as string);
		expect(typeof qdrantBody.points[0].id).toBe('number');
	});

	it('returns false when Ollama embed fails (and never hits Qdrant)', async () => {
		fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('/api/embeddings')) {
				return new Response('boom', { status: 503 });
			}
			throw new Error(`should not reach Qdrant when embed fails: ${url}`);
		});

		const { recordChatMessageForRecall } = await import(
			'$lib/server/ace/chat-memory.js'
		);

		const ok = await recordChatMessageForRecall({
			id: 'msg_1',
			sessionId: 's1',
			role: 'user',
			content: 'a long enough message to pass the filter',
		});

		expect(ok).toBe(false);
	});

	it('returns false when Ollama responds without an embedding field', async () => {
		fetchSpy.mockResolvedValue(
			new Response(JSON.stringify({ error: 'model unloaded' }), { status: 200 }),
		);

		const { recordChatMessageForRecall } = await import(
			'$lib/server/ace/chat-memory.js'
		);

		const ok = await recordChatMessageForRecall({
			id: 'msg_1',
			sessionId: 's1',
			role: 'user',
			content: 'a long enough message to pass the filter',
		});

		expect(ok).toBe(false);
	});
});

describe('chat-memory: hashToQdrantId', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	it('produces deterministic ids for the same input', async () => {
		const { hashToQdrantId } = await import('$lib/server/ace/chat-memory.js');

		const a = hashToQdrantId('msg_1234_abc');
		const b = hashToQdrantId('msg_1234_abc');
		expect(a).toBe(b);
	});

	it('produces different ids for different inputs', async () => {
		const { hashToQdrantId } = await import('$lib/server/ace/chat-memory.js');

		const a = hashToQdrantId('msg_1');
		const b = hashToQdrantId('msg_2');
		expect(a).not.toBe(b);
	});

	it('stays within the 53-bit safe-integer range', async () => {
		const { hashToQdrantId } = await import('$lib/server/ace/chat-memory.js');

		const SAFE_MAX = Number.MAX_SAFE_INTEGER; // 2^53 - 1
		for (const s of ['a', 'abc', 'long-msg-id-with-many-chars-0123456789']) {
			const n = hashToQdrantId(s);
			expect(Number.isInteger(n)).toBe(true);
			expect(n).toBeGreaterThanOrEqual(0);
			expect(n).toBeLessThanOrEqual(SAFE_MAX);
		}
	});
});
