// @vitest-environment node
/**
 * Tests for POST/GET /api/codebase-index/claude-assist/feedback
 * Validates auth guard, input validation, and degraded response shape.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ── Hoisted mocks ──────────────────────────────────────────────── */
const mockInsert = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/db/client', () => ({
	db: {
		insert: mockInsert.mockReturnValue({
			values: vi.fn().mockResolvedValue(undefined),
		}),
		select: mockSelect.mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					orderBy: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		}),
	},
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
	contextTimeline: { eventType: 'eventType', createdAt: 'createdAt' },
}));

vi.mock('drizzle-orm', () => ({
	eq: vi.fn((_col: any, val: any) => ({ col: _col, val })),
	desc: vi.fn((col: any) => ({ desc: col })),
}));

let POST: any;
let GET: any;

beforeEach(async () => {
	vi.clearAllMocks();
	const mod = await import(
		'../src/routes/api/codebase-index/claude-assist/feedback/+server.ts'
	);
	POST = mod.POST;
	GET = mod.GET;
});

/* ── Helpers ────────────────────────────────────────────────────── */
function makeRequest(body: unknown) {
	return {
		request: new Request('http://localhost/api/codebase-index/claude-assist/feedback', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		}),
		locals: { user: { id: 'user-1' } },
		url: new URL('http://localhost/api/codebase-index/claude-assist/feedback'),
	};
}

/* ── POST tests ─────────────────────────────────────────────────── */
describe('POST /api/codebase-index/claude-assist/feedback', () => {
	it('returns 401 without user', async () => {
		const res = await POST({
			request: new Request('http://localhost/', {
				method: 'POST',
				body: '{}',
			}),
			locals: {},
		});
		expect(res.status).toBe(401);
	});

	it('returns 400 for missing fields', async () => {
		const res = await POST(makeRequest({}));
		expect(res.status).toBe(400);
	});

	it('returns 400 for invalid useful field', async () => {
		const res = await POST(makeRequest({ queryHash: 'abc', useful: 'yes' }));
		expect(res.status).toBe(400);
	});

	it('returns 200 with valid feedback', async () => {
		const res = await POST(makeRequest({ queryHash: 'abc123', useful: true }));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.ok).toBe(true);
	});

	it('records feedback with comment', async () => {
		const res = await POST(
			makeRequest({ queryHash: 'xyz', useful: false, comment: 'Results irrelevant' }),
		);
		expect(res.status).toBe(200);
		expect(mockInsert).toHaveBeenCalled();
	});

	it('records feedback with editedFiles', async () => {
		const res = await POST(
			makeRequest({
				queryHash: 'xyz',
				useful: true,
				editedFiles: ['src/lib/foo.ts', 'src/lib/bar.ts'],
			}),
		);
		expect(res.status).toBe(200);
	});
});

/* ── GET tests ──────────────────────────────────────────────────── */
describe('GET /api/codebase-index/claude-assist/feedback', () => {
	it('returns 401 without user', async () => {
		const res = await GET({
			locals: {},
			url: new URL('http://localhost/api/codebase-index/claude-assist/feedback'),
		});
		expect(res.status).toBe(401);
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

		const res = await GET({
			locals: { user: { id: 'user-1' } },
			url: new URL('http://localhost/api/codebase-index/claude-assist/feedback'),
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toEqual({ total: 0, useful: 0, notUseful: 0, usefulPct: 0, recent: [] });
	});

	it('returns stats with empty DB', async () => {
		const res = await GET({
			locals: { user: { id: 'user-1' } },
			url: new URL('http://localhost/api/codebase-index/claude-assist/feedback'),
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.total).toBe(0);
		expect(body.usefulPct).toBe(0);
		expect(body.recent).toEqual([]);
	});
});
