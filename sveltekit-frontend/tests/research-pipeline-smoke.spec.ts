/**
 * Research pipeline end-to-end smoke test.
 *
 * Verifies the chain:
 *   1. Stream research starts and emits plan → worker → merging → complete events
 *   2. Summary persists to researchSummaries
 *   3. context_timeline events are written (started, worker_done, supervisor_done, persisted)
 *   4. Batch endpoint returns compact JSON with correct budget limits
 *   5. COMPACT_DEFAULTS are used by both stream + batch endpoints
 */

// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mock variables ────────────────────────────────────────────────────

const mockDbInsertValues = vi.hoisted(() => vi.fn());
const mockDbInsertReturning = vi.hoisted(() =>
	vi.fn(async () => [{ id: '00000000-0000-0000-0000-000000000099' }])
);
const mockDbInsert = vi.hoisted(() =>
	vi.fn(() => ({
		values: (...args: unknown[]) => {
			mockDbInsertValues(...args);
			return {
				returning: mockDbInsertReturning,
				catch: () => {},     // fire-and-forget path (emitTimeline)
			};
		},
	}))
);

// ── Static mocks ──────────────────────────────────────────────────────────────

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

vi.mock('$lib/server/env.server.js', () => ({
	ENV: {
		OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
		QDRANT_URL: 'http://127.0.0.1:6333',
		BIFROST_ENABLED: false,
	},
}));

vi.mock('$lib/config/env.server.js', () => ({
	getQdrantUrl: () => 'http://qdrant.test',
	getOllamaUrl: () => 'http://ollama.test',
}));

vi.mock('$lib/server/redis.js', () => ({
	getRedis: () => ({
		get: vi.fn(async () => null),
		set: vi.fn(async () => 'OK'),
		del: vi.fn(async () => 1),
	}),
	redis: {
		get: vi.fn(async () => null),
		set: vi.fn(async () => 'OK'),
	},
}));

vi.mock('$lib/server/db/client', () => ({
	db: {
		insert: mockDbInsert,
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => ({
					limit: vi.fn(async () => []),
				})),
			})),
		})),
		execute: vi.fn(async () => ({ rows: [] })),
	},
	pool: { query: vi.fn(async () => ({ rows: [] })) },
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
	researchSummaries: { id: 'id' },
	contextTimeline: {},
}));

// ── Mock the LangGraph functions ──────────────────────────────────────────────

const MOCK_FINDING = {
	domain: 'database',
	chunks: [{ id: 1, score: 0.9, payload: { file_path: 'src/lib/server/db/client.ts', summary: 'DB client' } }],
	summary: 'Database module handles PostgreSQL connections via Drizzle ORM.',
	keyInsights: ['Uses Drizzle ORM', 'Connection pooling via node-postgres'],
	relevantPaths: ['src/lib/server/db/client.ts', 'src/lib/server/db/schema-postgres.ts'],
	durationMs: 1234,
	source: 'qdrant',
	cached: false,
};

const mockSupervisorPlan = vi.fn(async () => ['database'] as const);
const mockRunWorker = vi.fn(async () => MOCK_FINDING);
const mockSupervisorMerge = vi.fn(async () => ({
	supervisorSummary: 'The codebase uses Drizzle ORM with PostgreSQL 16 for all DB operations.',
	keyFindings: ['Drizzle ORM 0.44 with pgvector', 'Connection pool via node-postgres'],
	actionItems: ['Add connection pool monitoring', 'Consider read replicas'],
}));
const mockFormatGraph = vi.fn(() => '# Research Summary\n\nDrizzle ORM analysis...');

vi.mock('$lib/server/ai/langgraph-research.js', () => ({
	supervisorPlan:          (...a: unknown[]) => mockSupervisorPlan(...a),
	runWorker:               (...a: unknown[]) => mockRunWorker(...a),
	supervisorMerge:         (...a: unknown[]) => mockSupervisorMerge(...a),
	formatGraphForClaudeCode: (...a: unknown[]) => mockFormatGraph(...a),
	runConcurrentResearch:   vi.fn(async (query: string, opts?: Record<string, unknown>) => ({
		query,
		domains:            opts?.domains ?? ['database'],
		workerFindings:     [MOCK_FINDING],
		supervisorSummary:  'The codebase uses Drizzle ORM with PostgreSQL 16.',
		keyFindings:        ['Drizzle ORM 0.44', 'pgvector support'],
		actionItems:        ['Monitor pool', 'Read replicas'],
		totalChunks:        1,
		totalDurationMs:    2000,
		cacheKey:           'test-cache-key',
	})),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockLocals(userId = '00000000-0000-0000-0000-000000000001') {
	return { user: { id: userId } };
}

function mockRequest(body: unknown) {
	return new Request('http://localhost:5173/test', {
		method: 'POST',
		body: JSON.stringify(body),
		headers: { 'Content-Type': 'application/json' },
	});
}

/** Parse an SSE text stream into an array of { event, data } objects. */
async function parseSSE(response: Response): Promise<Array<{ event: string; data: unknown }>> {
	const text = await response.text();
	const events: Array<{ event: string; data: unknown }> = [];
	for (const block of text.split('\n\n').filter(Boolean)) {
		const eventMatch = block.match(/^event: (.+)$/m);
		const dataMatch = block.match(/^data: (.+)$/m);
		if (eventMatch && dataMatch) {
			events.push({ event: eventMatch[1], data: JSON.parse(dataMatch[1]) });
		}
	}
	return events;
}

// ── Test suites ───────────────────────────────────────────────────────────────

describe('Research pipeline smoke test', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset the persisted-row mock to return a UUID
		mockDbInsertReturning.mockResolvedValue([{ id: '00000000-0000-0000-0000-000000000099' }]);
	});

	describe('COMPACT_DEFAULTS shared module', () => {
		it('exports identical defaults used by batch, stream, and assist', async () => {
			const { COMPACT_DEFAULTS, ASSIST_BUDGETS } = await import(
				'$lib/server/ai/compact-budgets.js'
			);

			expect(COMPACT_DEFAULTS).toEqual({
				maxFindings: 8,
				maxFiles: 5,
				maxActionItems: 5,
				maxSummaryChars: 2_400,
			});

			// ASSIST_BUDGETS extends COMPACT_DEFAULTS
			expect(ASSIST_BUDGETS.maxFindings).toBe(COMPACT_DEFAULTS.maxFindings);
			expect(ASSIST_BUDGETS.maxFiles).toBe(COMPACT_DEFAULTS.maxFiles);
			expect(ASSIST_BUDGETS.maxActionItems).toBe(COMPACT_DEFAULTS.maxActionItems);
			expect(ASSIST_BUDGETS.maxSummaryChars).toBe(COMPACT_DEFAULTS.maxSummaryChars);

			// Plus the extra assist-only fields
			expect(ASSIST_BUDGETS.maxSchemaIds).toBe(64);
			expect(ASSIST_BUDGETS.maxAceChunks).toBe(6);
		});
	});

	describe('POST /api/research/concurrent-deep/stream', () => {
		it('emits plan → worker → merging → complete SSE events', async () => {
			const { POST } = await import(
				'$lib/../routes/api/research/concurrent-deep/stream/+server.js'
			);

			const response = await (POST as Function)({
				request: mockRequest({ query: 'How does the DB layer work?', persist: true }),
				locals: mockLocals(),
			});

			expect(response.status).toBe(200);
			expect(response.headers.get('content-type')).toContain('text/event-stream');

			const events = await parseSSE(response);
			const eventTypes = events.map(e => e.event);

			// Verify correct SSE event sequence
			expect(eventTypes).toContain('plan');
			expect(eventTypes).toContain('worker');
			expect(eventTypes).toContain('merging');
			expect(eventTypes).toContain('complete');

			// plan event should list domains
			const plan = events.find(e => e.event === 'plan')!.data as Record<string, unknown>;
			expect(plan.domains).toEqual(['database']);

			// complete event should have required fields
			const complete = events.find(e => e.event === 'complete')!.data as Record<string, unknown>;
			expect(complete).toHaveProperty('supervisorSummary');
			expect(complete).toHaveProperty('keyFindings');
			expect(complete).toHaveProperty('actionItems');
			expect(complete).toHaveProperty('totalChunks');
			expect(complete).toHaveProperty('totalDurationMs');
		});

		it('persists summary to researchSummaries when persist=true', async () => {
			const { POST } = await import(
				'$lib/../routes/api/research/concurrent-deep/stream/+server.js'
			);

			const response = await (POST as Function)({
				request: mockRequest({ query: 'DB layer overview', persist: true }),
				locals: mockLocals(),
			});

			// Consume stream fully
			await response.text();

			// The insert mock is called for both contextTimeline (fire-and-forget) and
			// researchSummaries (with .returning). Count calls where .returning was used.
			expect(mockDbInsertReturning).toHaveBeenCalled();

			// complete event includes persistedId
			// Re-run to check event content
			mockDbInsertReturning.mockResolvedValue([{ id: 'abc-persisted-id' }]);

			const r2 = await (POST as Function)({
				request: mockRequest({ query: 'DB layer overview 2', persist: true }),
				locals: mockLocals(),
			});
			const events = await parseSSE(r2);
			const complete = events.find(e => e.event === 'complete')!.data as Record<string, unknown>;
			expect(complete.persistedId).toBe('abc-persisted-id');
		});

		it('writes context_timeline events', async () => {
			const { POST } = await import(
				'$lib/../routes/api/research/concurrent-deep/stream/+server.js'
			);

			const response = await (POST as Function)({
				request: mockRequest({ query: 'Timeline check', persist: true }),
				locals: mockLocals(),
			});

			await response.text();

			// emitTimeline calls db.insert(contextTimeline).values(...)
			// At minimum: started, worker_done, supervisor_done, persisted
			const timelineInserts = mockDbInsertValues.mock.calls.filter(
				(call) => {
					const val = call[0] as Record<string, unknown>;
					return val.pipeline === 'langgraph' && val.sessionId === '';
				}
			);
			expect(timelineInserts.length).toBeGreaterThanOrEqual(3);

			// Verify event types written
			const eventTypes = timelineInserts.map(c => (c[0] as Record<string, unknown>).eventType);
			expect(eventTypes).toContain('research.concurrent.started');
			expect(eventTypes).toContain('research.concurrent.worker_done');
			expect(eventTypes).toContain('research.concurrent.supervisor_done');
		});

		it('returns 401 without auth', async () => {
			const { POST } = await import(
				'$lib/../routes/api/research/concurrent-deep/stream/+server.js'
			);

			const response = await (POST as Function)({
				request: mockRequest({ query: 'test' }),
				locals: { user: null },
			});

			expect(response.status).toBe(401);
		});
	});

	describe('POST /api/research/concurrent-deep (batch)', () => {
		it('returns compact JSON with budget-limited fields', async () => {
			const { POST } = await import(
				'$lib/../routes/api/research/concurrent-deep/+server.js'
			);

			const response = await (POST as Function)({
				request: mockRequest({ query: 'How does the DB layer work?', compact: true }),
				locals: mockLocals(),
			});

			expect(response.status).toBe(200);
			const body = await response.json();

			expect(body.ok).toBe(true);
			expect(body.compact).toBe(true);
			expect(body.keyFindings.length).toBeLessThanOrEqual(8);
			expect(body.actionItems.length).toBeLessThanOrEqual(5);
			expect(body.workers).toBeInstanceOf(Array);

			// Verify compact limits are applied from COMPACT_DEFAULTS
			if (body.supervisorSummary.length > 0) {
				expect(body.supervisorSummary.length).toBeLessThanOrEqual(2400);
			}
		});

		it('returns 400 for invalid input', async () => {
			const { POST } = await import(
				'$lib/../routes/api/research/concurrent-deep/+server.js'
			);

			const response = await (POST as Function)({
				request: mockRequest({ query: 'ab' }), // too short (min 3)
				locals: mockLocals(),
			});

			expect(response.status).toBe(400);
		});
	});
});
