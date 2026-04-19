// @vitest-environment node
/**
 * Tests for GET/POST /api/codebase-index/claude-assist/defaults
 * — read/write tuned assist defaults from context_timeline.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ── Hoisted mocks ──────────────────────────────────────────────── */
const mockSelect = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/db/client', () => ({
	db: {
		select: mockSelect.mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					orderBy: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		}),
		insert: mockInsert.mockReturnValue({
			values: vi.fn().mockResolvedValue([]),
		}),
	},
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
	contextTimeline: { eventType: 'eventType', createdAt: 'createdAt' },
}));

vi.mock('$lib/server/ai/compact-budgets.js', () => ({
	ASSIST_BUDGETS: {
		maxFindings: 8, maxFiles: 5, maxActionItems: 5, maxSummaryChars: 2400,
		maxSchemaIds: 64, maxResearchFindings: 8, maxRetrievalHits: 12,
		maxGraphNeighbors: 10, maxAceChunks: 6, maxErrorCards: 5,
	},
}));

vi.mock('drizzle-orm', () => ({
	eq: vi.fn((_col: any, val: any) => ({ col: _col, val })),
	desc: vi.fn((col: any) => ({ desc: col })),
}));

let GET: any;
let POST: any;

beforeEach(async () => {
	vi.clearAllMocks();
	// Reset insert mock chain
	mockInsert.mockReturnValue({
		values: vi.fn().mockResolvedValue([]),
	});
	// Reset select mock chain
	mockSelect.mockReturnValue({
		from: vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				orderBy: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([]),
				}),
			}),
		}),
	});
	const mod = await import(
		'../src/routes/api/codebase-index/claude-assist/defaults/+server.ts'
	);
	GET = mod.GET;
	POST = mod.POST;
});

function makeCtx(body?: Record<string, any>) {
	return {
		locals: { user: { id: 'user-1' } },
		request: new Request('http://localhost/api/codebase-index/claude-assist/defaults', {
			method: body ? 'POST' : 'GET',
			headers: { 'Content-Type': 'application/json' },
			body: body ? JSON.stringify(body) : undefined,
		}),
	};
}

/* ── GET ────────────────────────────────────────────────────────── */
describe('GET /defaults', () => {
	it('returns 401 without user', async () => {
		const res = await GET({ locals: {}, request: new Request('http://localhost/') });
		expect(res.status).toBe(401);
	});

	it('returns code defaults and null applied when no rows', async () => {
		const body = await (await GET(makeCtx())).json();
		expect(body.codeDefaults.maxGraphNeighbors).toBe(10);
		expect(body.codeDefaults.maxAceChunks).toBe(6);
		expect(body.applied).toBeNull();
		expect(body.appliedAt).toBeNull();
	});

	it('returns applied defaults when row exists', async () => {
		mockSelect.mockReturnValueOnce({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					orderBy: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								payload: { maxGraphNeighbors: 14, maxAceChunks: 8 },
								createdAt: new Date('2026-04-19T00:00:00Z'),
							},
						]),
					}),
				}),
			}),
		});
		const body = await (await GET(makeCtx())).json();
		expect(body.applied).toEqual({ maxGraphNeighbors: 14, maxAceChunks: 8 });
		expect(body.appliedAt).not.toBeNull();
	});

	it('returns degraded shape on DB failure', async () => {
		mockSelect.mockReturnValueOnce({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					orderBy: vi.fn().mockReturnValue({
						limit: vi.fn().mockRejectedValue(new Error('DB down')),
					}),
				}),
			}),
		});
		const body = await (await GET(makeCtx())).json();
		expect(body.codeDefaults.maxGraphNeighbors).toBe(10);
		expect(body.applied).toBeNull();
	});
});

/* ── POST ───────────────────────────────────────────────────────── */
describe('POST /defaults', () => {
	it('returns 401 without user', async () => {
		const res = await POST({
			locals: {},
			request: new Request('http://localhost/', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ maxGraphNeighbors: 14 }),
			}),
		});
		expect(res.status).toBe(401);
	});

	it('returns 400 with empty body', async () => {
		const res = await POST(makeCtx({}));
		expect(res.status).toBe(400);
	});

	it('returns 400 with invalid values', async () => {
		const res = await POST(makeCtx({ maxGraphNeighbors: 100 }));
		expect(res.status).toBe(400);
	});

	it('applies valid defaults', async () => {
		const res = await POST(makeCtx({ maxGraphNeighbors: 14, maxAceChunks: 8 }));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.ok).toBe(true);
		expect(body.applied).toEqual({ maxGraphNeighbors: 14, maxAceChunks: 8 });
	});

	it('applies compact flag', async () => {
		const res = await POST(makeCtx({ compact: false }));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.applied.compact).toBe(false);
	});

	it('applies cacheTtlHint', async () => {
		const res = await POST(makeCtx({ cacheTtlHint: 'shorter' }));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.applied.cacheTtlHint).toBe('shorter');
	});

	it('returns 500 on DB insert failure', async () => {
		mockInsert.mockReturnValueOnce({
			values: vi.fn().mockRejectedValue(new Error('DB fail')),
		});
		const res = await POST(makeCtx({ maxGraphNeighbors: 8 }));
		expect(res.status).toBe(500);
	});
});
