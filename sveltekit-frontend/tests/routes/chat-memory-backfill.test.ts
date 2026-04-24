// @vitest-environment node
/**
 * Unit tests for POST /api/chat/memory/backfill
 *
 * The backfill endpoint streams SSE events while walking Postgres
 * chat_messages → Qdrant. Tests collect the full stream and assert:
 *
 *   - auth gate
 *   - skip rules (system role, short content, already-indexed dedup)
 *   - dry-run (emits progress but does NOT call indexChatMessage)
 *   - happy path (embed via Ollama → upsert via indexChatMessage)
 *   - failure counting (non-2xx Ollama response → failed++)
 *   - empty-candidates short-circuit
 *   - error event when db.execute throws inside the stream
 *
 * The test helper `collectSse()` parses the ReadableStream body into a
 * flat list of { event, data } objects so assertions can look at the
 * full event sequence, not just the last one.
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

const { mockDbExecute, mockIndexChatMessage, mockHashToQdrantId } = vi.hoisted(() => ({
	mockDbExecute: vi.fn(),
	mockIndexChatMessage: vi.fn(),
	mockHashToQdrantId: vi.fn(),
}));

vi.mock('$lib/server/db/client', () => ({
	db: { execute: (...args: unknown[]) => mockDbExecute(...args) },
}));

vi.mock('$lib/server/ace/chat-memory.js', () => ({
	indexChatMessage: (...args: unknown[]) => mockIndexChatMessage(...args),
	hashToQdrantId: (...args: unknown[]) => mockHashToQdrantId(...args),
}));

// Use the real sse-utils — it only does string formatting
vi.mock('$lib/server/streaming/sse-utils.js', async (importOriginal) => {
	const real = await importOriginal<typeof import('$lib/server/streaming/sse-utils.js')>();
	return real;
});

import { makeAuthEvent, makeEvent } from '../helpers/route-test-utils.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface SseEvent {
	event: string;
	data: Record<string, unknown>;
}

/** Consume an SSE Response body and return the ordered list of events. */
async function collectSse(res: Response): Promise<SseEvent[]> {
	const text = await res.text();
	const events: SseEvent[] = [];
	for (const block of text.split('\n\n')) {
		if (!block.trim()) continue;
		let event = '';
		let data = '';
		for (const line of block.split('\n')) {
			if (line.startsWith('event:')) event = line.slice(6).trim();
			else if (line.startsWith('data:')) data = line.slice(5).trim();
		}
		if (!event) continue;
		try {
			events.push({ event, data: JSON.parse(data) });
		} catch {
			/* skip non-JSON data */
		}
	}
	return events;
}

// Deterministic id hasher for the test suite — just parseInt the "msg_N" tail
function fakeHash(s: string): number {
	const m = /msg_(\d+)/.exec(s);
	return m ? Number(m[1]) : s.charCodeAt(0);
}

describe('/api/chat/memory/backfill', () => {
	let fetchSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockHashToQdrantId.mockImplementation((s: string) => fakeHash(s));
		fetchSpy = vi.spyOn(global, 'fetch');
	});

	afterEach(() => {
		fetchSpy.mockRestore();
	});

	// ── Auth ───────────────────────────────────────────────────────────────

	it('returns 403 for non-admin', async () => {
		const { POST } = await import(
			'../../src/routes/api/chat/memory/backfill/+server.js'
		);
		const event = makeEvent({
			url: '/api/chat/memory/backfill',
			method: 'POST',
		});
		const res = await POST(event as any);
		expect(res.status).toBe(403);
	});

	// ── Empty candidates ───────────────────────────────────────────────────

	it('streams start + complete with zero candidates when table is empty', async () => {
		mockDbExecute.mockResolvedValue({ rows: [] });
		// The Qdrant id-check endpoint is never hit with 0 candidates
		fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));

		const { POST } = await import(
			'../../src/routes/api/chat/memory/backfill/+server.js'
		);
		const event = makeAuthEvent({
			url: '/api/chat/memory/backfill',
			method: 'POST',
		});
		const res = await POST(event as any);

		expect(res.status).toBe(200);
		const events = await collectSse(res);

		expect(events.map((e) => e.event)).toEqual(['start', 'complete']);
		expect(events[0].data).toMatchObject({ candidates: 0, dryRun: false });
		expect(events[1].data).toMatchObject({ processed: 0, skipped: 0, failed: 0 });
		expect(mockIndexChatMessage).not.toHaveBeenCalled();
	});

	// ── Skip rules ────────────────────────────────────────────────────────

	it('counts already-indexed rows as skipped without calling Ollama/Qdrant', async () => {
		mockDbExecute.mockResolvedValue({
			rows: [
				{ id: 'msg_1', chat_id: 'c1', role: 'user', content: 'this is a long message', created_at: new Date() },
				{ id: 'msg_2', chat_id: 'c1', role: 'user', content: 'another long message', created_at: new Date() },
			],
		});

		// Qdrant says both ids already exist
		fetchSpy.mockResolvedValue(
			new Response(
				JSON.stringify({ result: [{ id: 1 }, { id: 2 }] }),
				{ status: 200 },
			),
		);

		const { POST } = await import(
			'../../src/routes/api/chat/memory/backfill/+server.js'
		);
		const event = makeAuthEvent({
			url: '/api/chat/memory/backfill',
			method: 'POST',
		});
		const res = await POST(event as any);

		const events = await collectSse(res);
		const complete = events.find((e) => e.event === 'complete')!;
		expect(complete.data).toMatchObject({ processed: 0, skipped: 2, failed: 0 });
		expect(mockIndexChatMessage).not.toHaveBeenCalled();

		// The Qdrant pre-check was made — the embed pass was NOT
		const qdrantPrecheckCalls = fetchSpy.mock.calls.filter((c) =>
			String(c[0]).includes('/collections/chat_messages/points'),
		);
		expect(qdrantPrecheckCalls).toHaveLength(1);
	});

	it('counts short-content and system rows as skipped', async () => {
		mockDbExecute.mockResolvedValue({
			rows: [
				{ id: 'msg_10', chat_id: 'c1', role: 'user', content: 'hi', created_at: new Date() }, // too short
				{ id: 'msg_11', chat_id: 'c1', role: 'system', content: 'a long enough system msg', created_at: new Date() }, // system role
				{ id: 'msg_12', chat_id: 'c1', role: 'user', content: 'a valid user message', created_at: new Date() },
			],
		});

		// Qdrant pre-check: nothing already indexed
		fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('/collections/chat_messages/points') && !url.endsWith('/points')) {
				// pre-check lookup — return empty
				return new Response(JSON.stringify({ result: [] }), { status: 200 });
			}
			if (url.includes('/api/embeddings')) {
				return new Response(
					JSON.stringify({ embedding: Array.from({ length: 768 }, () => 0.1) }),
					{ status: 200 },
				);
			}
			return new Response('{}', { status: 200 });
		});

		mockIndexChatMessage.mockResolvedValue(true);

		const { POST } = await import(
			'../../src/routes/api/chat/memory/backfill/+server.js'
		);
		const event = makeAuthEvent({
			url: '/api/chat/memory/backfill',
			method: 'POST',
		});
		const res = await POST(event as any);

		const events = await collectSse(res);
		const complete = events.find((e) => e.event === 'complete')!;
		expect(complete.data).toMatchObject({ processed: 1, skipped: 2, failed: 0 });
	});

	// ── Dry-run ───────────────────────────────────────────────────────────

	it('dry-run counts candidates as processed without calling indexChatMessage', async () => {
		const rows = Array.from({ length: 3 }, (_, i) => ({
			id: `msg_${100 + i}`,
			chat_id: 'c1',
			role: 'user',
			content: `message number ${i} with enough length`,
			created_at: new Date(),
		}));
		mockDbExecute.mockResolvedValue({ rows });

		fetchSpy.mockResolvedValue(
			new Response(JSON.stringify({ result: [] }), { status: 200 }),
		);

		const { POST } = await import(
			'../../src/routes/api/chat/memory/backfill/+server.js'
		);
		const event = makeAuthEvent({
			url: '/api/chat/memory/backfill?dryRun=1',
			method: 'POST',
		});
		const res = await POST(event as any);

		const events = await collectSse(res);
		const complete = events.find((e) => e.event === 'complete')!;
		expect(complete.data).toMatchObject({
			processed: 3,
			skipped: 0,
			failed: 0,
			dryRun: true,
		});
		expect(mockIndexChatMessage).not.toHaveBeenCalled();

		// start event also reflects dryRun
		const start = events.find((e) => e.event === 'start')!;
		expect(start.data.dryRun).toBe(true);
	});

	// ── Happy path ─────────────────────────────────────────────────────────

	it('embeds via Ollama and calls indexChatMessage on live run', async () => {
		const rows = [
			{
				id: 'msg_201',
				chat_id: 'chat-abc',
				role: 'user',
				content: 'Explain the elements of negligence per se.',
				created_at: new Date('2026-04-01T10:00:00Z'),
			},
		];
		mockDbExecute.mockResolvedValue({ rows });

		const emb = Array.from({ length: 768 }, () => 0.42);
		fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('/api/embeddings')) {
				return new Response(JSON.stringify({ embedding: emb }), { status: 200 });
			}
			// pre-check: nothing indexed yet
			if (url.includes('/collections/chat_messages/points')) {
				return new Response(JSON.stringify({ result: [] }), { status: 200 });
			}
			return new Response('{}', { status: 200 });
		});

		mockIndexChatMessage.mockResolvedValue(true);

		const { POST } = await import(
			'../../src/routes/api/chat/memory/backfill/+server.js'
		);
		const event = makeAuthEvent({
			url: '/api/chat/memory/backfill',
			method: 'POST',
		});
		const res = await POST(event as any);

		const events = await collectSse(res);
		const complete = events.find((e) => e.event === 'complete')!;
		expect(complete.data).toMatchObject({ processed: 1, failed: 0, skipped: 0 });

		expect(mockIndexChatMessage).toHaveBeenCalledTimes(1);
		const [msg, passedEmbedding] = mockIndexChatMessage.mock.calls[0];
		expect(msg).toMatchObject({
			id: 201, // fakeHash('msg_201') = 201
			sessionId: 'chat-abc',
			role: 'user',
			content: 'Explain the elements of negligence per se.',
		});
		expect(passedEmbedding).toEqual(emb);
	});

	it('increments failed counter when Ollama embed returns non-2xx', async () => {
		const rows = [
			{
				id: 'msg_301',
				chat_id: 'c1',
				role: 'user',
				content: 'this is a sufficiently long message',
				created_at: new Date(),
			},
		];
		mockDbExecute.mockResolvedValue({ rows });

		fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('/api/embeddings')) {
				return new Response('embed server down', { status: 503 });
			}
			return new Response(JSON.stringify({ result: [] }), { status: 200 });
		});

		const { POST } = await import(
			'../../src/routes/api/chat/memory/backfill/+server.js'
		);
		const event = makeAuthEvent({
			url: '/api/chat/memory/backfill',
			method: 'POST',
		});
		const res = await POST(event as any);

		const events = await collectSse(res);
		const complete = events.find((e) => e.event === 'complete')!;
		expect(complete.data).toMatchObject({ processed: 0, failed: 1, skipped: 0 });
		expect(mockIndexChatMessage).not.toHaveBeenCalled();
	});

	// ── Param handling ────────────────────────────────────────────────────

	it('applies limit param (clamped to [1, 5000])', async () => {
		mockDbExecute.mockResolvedValue({ rows: [] });

		const { POST } = await import(
			'../../src/routes/api/chat/memory/backfill/+server.js'
		);

		// limit=50 → candidates call should include LIMIT 50
		const event = makeAuthEvent({
			url: '/api/chat/memory/backfill?limit=50',
			method: 'POST',
		});
		const res = await POST(event as any);
		await collectSse(res); // drain

		expect(mockDbExecute).toHaveBeenCalledTimes(1);
		const [sqlArg] = mockDbExecute.mock.calls[0];
		// drizzle's sql template serializes params as a structured object,
		// not raw SQL text — we check the limit made it through the query builder
		expect(JSON.stringify(sqlArg)).toContain('50');
	});

	it('clamps limit=0 up to 1', async () => {
		mockDbExecute.mockResolvedValue({ rows: [] });

		const { POST } = await import(
			'../../src/routes/api/chat/memory/backfill/+server.js'
		);
		const event = makeAuthEvent({
			url: '/api/chat/memory/backfill?limit=0',
			method: 'POST',
		});
		const res = await POST(event as any);
		const events = await collectSse(res);
		const start = events.find((e) => e.event === 'start')!;
		// start event reflects the clamped value the handler computed
		expect(start.data.limit).toBe(1);
	});

	// ── Error path ────────────────────────────────────────────────────────

	it('emits start with candidates=0 when db.execute throws, then complete', async () => {
		// fetchCandidates has its own try/catch that returns [] on error,
		// so db failures degrade to empty-candidates, not to an SSE 'error' event.
		mockDbExecute.mockRejectedValue(new Error('ECONNREFUSED'));

		const { POST } = await import(
			'../../src/routes/api/chat/memory/backfill/+server.js'
		);
		const event = makeAuthEvent({
			url: '/api/chat/memory/backfill',
			method: 'POST',
		});
		const res = await POST(event as any);

		const events = await collectSse(res);
		// start + complete, no processed rows
		expect(events.map((e) => e.event)).toEqual(['start', 'complete']);
		expect(events[0].data).toMatchObject({ candidates: 0 });
		expect(events[1].data).toMatchObject({ processed: 0 });
	});
});
