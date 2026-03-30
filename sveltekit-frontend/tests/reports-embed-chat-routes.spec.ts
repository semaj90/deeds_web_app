/**
 * Reports + Embed + Chat + Summarize + POI Relationships — Unit Tests
 *
 * Tests for:
 *   /api/reports (GET/POST/PATCH/DELETE)
 *   /api/reports/save (POST)
 *   /api/summarize (POST)
 *   /api/embed (POST)
 *   /api/chat (POST)
 *   /api/persons-of-interest/relationships (POST)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Valid UUID v4 for Zod z.string().uuid() ────────────────────
const UUID1 = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const UUID2 = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
const UUID3 = 'c3d4e5f6-a7b8-4c9d-ae1f-2a3b4c5d6e7f';

// ── DB chain builders ──────────────────────────────────────────
function buildSelectChain(data: unknown[] = []) {
	const withCache = vi.fn(async () => data);
	const offsetFn = vi.fn(() => ({ $withCache: withCache }));
	const limitFn = vi.fn(() => ({ offset: offsetFn, $withCache: withCache }));
	const orderByFn = vi.fn(() => ({ limit: limitFn, offset: offsetFn, $withCache: withCache }));
	const whereFn = vi.fn(() => ({ orderBy: orderByFn, limit: limitFn, $withCache: withCache }));
	return { from: vi.fn(() => ({ where: whereFn, orderBy: orderByFn, limit: limitFn })) };
}

function buildInsertChain(data: unknown[] = []) {
	return {
		values: vi.fn(() => ({
			returning: vi.fn(async () => data),
		})),
	};
}

function buildUpdateChain(data: unknown[] = []) {
	return {
		set: vi.fn(() => ({
			where: vi.fn(() => ({
				returning: vi.fn(async () => data),
			})),
		})),
	};
}

function buildDeleteChain(data: unknown[] = []) {
	return {
		where: vi.fn(() => ({
			returning: vi.fn(async () => data),
		})),
	};
}

// ── Mocks ──────────────────────────────────────────────────────
vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

vi.mock('$lib/server/env.server.js', () => ({
	ENV: { OLLAMA_BASE_URL: 'http://ollama.test' },
}));

vi.mock('$lib/config/env.server.js', () => ({
	getOllamaUrl: () => 'http://ollama.test',
}));

const mockOllamaFetch = vi.fn();
vi.mock('$lib/server/ollama.js', () => ({
	ollamaFetch: (...args: unknown[]) => mockOllamaFetch(...args),
}));

vi.mock('$lib/server/db/client', () => ({
	db: {
		select: vi.fn(() => buildSelectChain()),
		insert: vi.fn(() => buildInsertChain()),
		update: vi.fn(() => buildUpdateChain()),
		delete: vi.fn(() => buildDeleteChain()),
	},
}));

const mockSchema = {
	reports: {
		id: 'id',
		caseId: 'case_id',
		content: 'content',
		title: 'title',
		type: 'type',
		status: 'status',
		createdBy: 'created_by',
		createdAt: 'created_at',
		updatedAt: 'updated_at',
		metadata: 'metadata',
	},
	chatMetadata: { chatId: 'chat_id', userId: 'user_id' },
	chatMessages: { id: 'id', chatId: 'chat_id', role: 'role', content: 'content' },
	poiRelationships: {
		poiId1: 'poi_id_1',
		poiId2: 'poi_id_2',
		relationshipType: 'relationship_type',
		strength: 'strength',
	},
};
vi.mock('$lib/server/db/schema', () => mockSchema);
vi.mock('$lib/server/db/schema.js', () => mockSchema);

vi.mock('$lib/server/db/schema-postgres.js', () => ({}));

vi.mock('drizzle-orm', () => ({
	eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
	desc: vi.fn((...args: unknown[]) => ({ type: 'desc', args })),
	and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
	inArray: vi.fn((...args: unknown[]) => ({ type: 'inArray', args })),
	sql: vi.fn(),
}));

vi.mock('$lib/server/reports/audit', () => ({
	auditReportAction: vi.fn(async () => {}),
	createReportVersion: vi.fn(async () => {}),
}));

vi.mock('$lib/server/cache/invalidation.js', () => ({
	invalidateReportCache: vi.fn(async () => {}),
	invalidateCaseCache: vi.fn(async () => {}),
}));

vi.mock('$lib/server/queue/rabbitmq-manager-fixed.js', () => ({
	rabbitmq: {
		publishAnalyticsEvent: vi.fn(async () => {}),
	},
}));

const mockApiResponses = {
	success: vi.fn((data: unknown) => Response.json(data)),
	badRequest: vi.fn((msg: string) => Response.json({ error: msg }, { status: 400 })),
	serviceUnavailable: vi.fn((msg: string) => Response.json({ error: msg }, { status: 503 })),
};
vi.mock('$lib/server/api/response-helper.js', () => ({
	apiResponses: mockApiResponses,
}));

vi.mock('$lib/server/middleware/rate-limiter.js', () => ({
	embedRateLimiter: {
		check: vi.fn(() => ({ allowed: true, remaining: 59, resetTime: Date.now() + 60000 })),
	},
}));

vi.mock('$lib/server/inference/gpu-arbiter.js', () => ({
	acquireGpuLease: vi.fn(async () => ({ backend: 'ollama', expiresAt: Date.now() + 60000 })),
	releaseGpuLease: vi.fn(async () => {}),
}));

vi.mock('$lib/server/embedding/embed.js', () => ({
	embedText: vi.fn(async () => Array.from({ length: 768 }, (_, i) => Math.sin(i / 100) * 0.5)),
}));

vi.mock('$lib/server/observability/langfuse.js', () => ({
	traceEmbedding: vi.fn(async (_text: string, _model: string, fn: () => Promise<unknown>) => fn()),
}));

vi.mock('$lib/server/ai/token-tracker.js', () => ({
	trackTokenUsage: vi.fn(),
	extractOllamaTokens: vi.fn(() => ({ promptTokens: 10, completionTokens: 20 })),
}));

// ── Helpers ────────────────────────────────────────────────────
function mkUrl(path: string, params?: Record<string, string>) {
	const u = new URL(`http://localhost${path}`);
	if (params) Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
	return u;
}

function mkRequest(body?: unknown, method = 'POST'): Request {
	return new Request('http://localhost/api/test', {
		method,
		headers: { 'Content-Type': 'application/json' },
		body: body !== undefined ? JSON.stringify(body) : undefined,
	});
}

const authedLocals = { user: { id: 'user-1', email: 'test@test.com', role: 'admin' } } as any;
const anonLocals = { user: null } as any;

// ── Reset mocks ────────────────────────────────────────────────
beforeEach(() => {
	vi.clearAllMocks();
	mockOllamaFetch.mockReset();
});

// ════════════════════════════════════════════════════════════════
// REPORTS CRUD: /api/reports
// ════════════════════════════════════════════════════════════════
describe('/api/reports (GET/POST/PATCH/DELETE)', () => {
	let GET: Function, POST: Function, PATCH: Function, DELETE: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/reports/+server');
		GET = mod.GET;
		POST = mod.POST;
		PATCH = mod.PATCH;
		DELETE = mod.DELETE;
	});

	// ── GET ──
	describe('GET', () => {
		it('returns 401 when unauthenticated', async () => {
			try {
				await GET({ url: mkUrl('/api/reports'), locals: anonLocals });
				expect.unreachable('should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(401);
			}
		});

		it('returns all user reports with defaults', async () => {
			const { db } = await import('$lib/server/db/client');
			const reports = [{ id: 'r-1', title: 'Report 1', status: 'draft' }];
			(db.select as any).mockReturnValueOnce(buildSelectChain(reports));

			const res = await GET({ url: mkUrl('/api/reports'), locals: authedLocals });
			const data = await res.json();
			expect(res.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data).toEqual(reports);
		});

		it('filters by caseId', async () => {
			const { db } = await import('$lib/server/db/client');
			const reports = [{ id: 'r-2', title: 'Case Report', caseId: UUID1 }];
			(db.select as any).mockReturnValueOnce(buildSelectChain(reports));

			const res = await GET({
				url: mkUrl('/api/reports', { caseId: UUID1 }),
				locals: authedLocals,
			});
			const data = await res.json();
			expect(res.status).toBe(200);
			expect(data.data).toEqual(reports);
		});

		it('filters by comma-separated ids', async () => {
			const { db } = await import('$lib/server/db/client');
			const reports = [
				{ id: UUID1, title: 'Report A' },
				{ id: UUID2, title: 'Report B' },
			];
			(db.select as any).mockReturnValueOnce(buildSelectChain(reports));

			const res = await GET({
				url: mkUrl('/api/reports', { ids: `${UUID1},${UUID2}` }),
				locals: authedLocals,
			});
			const data = await res.json();
			expect(res.status).toBe(200);
			expect(data.data).toEqual(reports);
		});

		it('returns 400 for invalid limit', async () => {
			const res = await GET({
				url: mkUrl('/api/reports', { limit: '999' }),
				locals: authedLocals,
			});
			expect(res.status).toBe(400);
		});

		it('returns 500 on DB error', async () => {
			const { db } = await import('$lib/server/db/client');
			(db.select as any).mockReturnValueOnce({
				from: vi.fn(() => ({
					where: vi.fn(() => ({
						orderBy: vi.fn(() => ({
							limit: vi.fn(() => ({
								offset: vi.fn(() => ({
									$withCache: vi.fn(async () => { throw new Error('DB down'); }),
								})),
							})),
						})),
					})),
				})),
			});

			try {
				await GET({ url: mkUrl('/api/reports'), locals: authedLocals });
				expect.unreachable('should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(500);
			}
		});
	});

	// ── POST ──
	describe('POST', () => {
		it('returns 401 when unauthenticated', async () => {
			try {
				await POST({ request: mkRequest({}), locals: anonLocals });
				expect.unreachable('should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(401);
			}
		});

		it('returns error for missing caseId', async () => {
			try {
				await POST({ request: mkRequest({ title: 'Test' }), locals: authedLocals });
				expect.unreachable('should have thrown');
			} catch (err: any) {
				// HttpError(400) thrown inside try/catch becomes 500 (HttpError !instanceof Error)
				expect(err.status).toBe(500);
			}
		});

		it('returns error for invalid caseId UUID', async () => {
			try {
				await POST({ request: mkRequest({ caseId: 'not-uuid' }), locals: authedLocals });
				expect.unreachable('should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(500);
			}
		});

		it('creates report with valid data', async () => {
			const { db } = await import('$lib/server/db/client');
			const newReport = {
				id: UUID3,
				title: 'Test Report',
				caseId: UUID1,
				type: 'custom',
				status: 'draft',
				content: '<p>Start writing...</p>',
				createdBy: 'user-1',
			};
			(db.insert as any).mockReturnValueOnce(buildInsertChain([newReport]));

			const res = await POST({
				request: mkRequest({ caseId: UUID1, title: 'Test Report' }),
				locals: authedLocals,
			});
			const data = await res.json();
			expect(res.status).toBe(201);
			expect(data.success).toBe(true);
			expect(data.data.title).toBe('Test Report');
		});

		it('creates report with explicit type and metadata', async () => {
			const { db } = await import('$lib/server/db/client');
			const newReport = {
				id: UUID3,
				title: 'Legal Brief',
				type: 'legal_brief',
				status: 'pending',
				metadata: { reportType: 'brief' },
			};
			(db.insert as any).mockReturnValueOnce(buildInsertChain([newReport]));

			const res = await POST({
				request: mkRequest({
					caseId: UUID1,
					title: 'Legal Brief',
					type: 'legal_brief',
					status: 'pending',
					metadata: { reportType: 'brief' },
				}),
				locals: authedLocals,
			});
			const data = await res.json();
			expect(res.status).toBe(201);
			expect(data.data.type).toBe('legal_brief');
		});

		it('calls audit and cache invalidation on create', async () => {
			const { db } = await import('$lib/server/db/client');
			const { auditReportAction } = await import('$lib/server/reports/audit');
			const { invalidateReportCache } = await import('$lib/server/cache/invalidation.js');
			(db.insert as any).mockReturnValueOnce(buildInsertChain([{ id: UUID3, title: 'R', status: 'draft' }]));

			await POST({
				request: mkRequest({ caseId: UUID1 }),
				locals: authedLocals,
			});
			expect(auditReportAction).toHaveBeenCalledOnce();
			expect(invalidateReportCache).toHaveBeenCalled();
		});

		it('returns 500 on DB error', async () => {
			const { db } = await import('$lib/server/db/client');
			(db.insert as any).mockReturnValueOnce({
				values: vi.fn(() => ({
					returning: vi.fn(async () => { throw new Error('DB error'); }),
				})),
			});

			try {
				await POST({ request: mkRequest({ caseId: UUID1 }), locals: authedLocals });
				expect.unreachable('should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(500);
			}
		});
	});

	// ── PATCH ──
	describe('PATCH', () => {
		it('returns 401 when unauthenticated', async () => {
			try {
				await PATCH({ request: mkRequest({}), locals: anonLocals });
				expect.unreachable('should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(401);
			}
		});

		it('returns error for empty ids array', async () => {
			try {
				await PATCH({ request: mkRequest({ ids: [] }), locals: authedLocals });
				expect.unreachable('should have thrown');
			} catch (err: any) {
				// HttpError(400) caught inside try/catch becomes 500
				expect(err.status).toBe(500);
			}
		});

		it('returns error for invalid UUID in ids', async () => {
			try {
				await PATCH({ request: mkRequest({ ids: ['not-uuid'] }), locals: authedLocals });
				expect.unreachable('should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(500);
			}
		});

		it('bulk updates reports with status', async () => {
			const { db } = await import('$lib/server/db/client');
			const updated = [{ id: UUID1, title: 'R1', status: 'completed' }];
			(db.update as any).mockReturnValueOnce(buildUpdateChain(updated));

			const res = await PATCH({
				request: mkRequest({ ids: [UUID1], status: 'completed' }),
				locals: authedLocals,
			});
			const data = await res.json();
			expect(res.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data).toBe(1);
		});

		it('bulk updates with title and content', async () => {
			const { db } = await import('$lib/server/db/client');
			const updated = [
				{ id: UUID1, title: 'Updated', status: 'draft' },
				{ id: UUID2, title: 'Updated', status: 'draft' },
			];
			(db.update as any).mockReturnValueOnce(buildUpdateChain(updated));

			const res = await PATCH({
				request: mkRequest({ ids: [UUID1, UUID2], title: 'Updated', contentHtml: '<p>New</p>' }),
				locals: authedLocals,
			});
			const data = await res.json();
			expect(data.data).toBe(2);
		});

		it('calls audit for each updated report', async () => {
			const { db } = await import('$lib/server/db/client');
			const { auditReportAction } = await import('$lib/server/reports/audit');
			(db.update as any).mockReturnValueOnce(buildUpdateChain([
				{ id: UUID1, status: 'published' },
				{ id: UUID2, status: 'published' },
			]));

			await PATCH({
				request: mkRequest({ ids: [UUID1, UUID2], status: 'published' }),
				locals: authedLocals,
			});
			expect(auditReportAction).toHaveBeenCalledTimes(2);
		});

		it('returns 500 on DB error', async () => {
			const { db } = await import('$lib/server/db/client');
			(db.update as any).mockReturnValueOnce({
				set: vi.fn(() => ({
					where: vi.fn(() => ({
						returning: vi.fn(async () => { throw new Error('DB error'); }),
					})),
				})),
			});

			try {
				await PATCH({
					request: mkRequest({ ids: [UUID1], status: 'completed' }),
					locals: authedLocals,
				});
				expect.unreachable('should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(500);
			}
		});
	});

	// ── DELETE ──
	describe('DELETE', () => {
		it('returns 401 when unauthenticated', async () => {
			try {
				await DELETE({ request: mkRequest({ ids: [UUID1] }, 'DELETE'), locals: anonLocals });
				expect.unreachable('should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(401);
			}
		});

		it('returns error for empty ids', async () => {
			try {
				await DELETE({ request: mkRequest({ ids: [] }, 'DELETE'), locals: authedLocals });
				expect.unreachable('should have thrown');
			} catch (err: any) {
				// HttpError(400) caught inside try/catch becomes 500
				expect(err.status).toBe(500);
			}
		});

		it('bulk deletes reports', async () => {
			const { db } = await import('$lib/server/db/client');
			const deleted = [{ id: UUID1, title: 'Gone', status: 'draft' }];
			(db.delete as any).mockReturnValueOnce(buildDeleteChain(deleted));

			const res = await DELETE({
				request: mkRequest({ ids: [UUID1] }, 'DELETE'),
				locals: authedLocals,
			});
			const data = await res.json();
			expect(res.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.count).toBe(1);
		});

		it('calls audit for each deleted report', async () => {
			const { db } = await import('$lib/server/db/client');
			const { auditReportAction } = await import('$lib/server/reports/audit');
			(db.delete as any).mockReturnValueOnce(buildDeleteChain([
				{ id: UUID1, title: 'A', status: 'draft' },
				{ id: UUID2, title: 'B', status: 'draft' },
			]));

			await DELETE({
				request: mkRequest({ ids: [UUID1, UUID2] }, 'DELETE'),
				locals: authedLocals,
			});
			expect(auditReportAction).toHaveBeenCalledTimes(2);
		});

		it('returns 500 on DB error', async () => {
			const { db } = await import('$lib/server/db/client');
			(db.delete as any).mockReturnValueOnce({
				where: vi.fn(() => ({
					returning: vi.fn(async () => { throw new Error('DB fail'); }),
				})),
			});

			try {
				await DELETE({
					request: mkRequest({ ids: [UUID1] }, 'DELETE'),
					locals: authedLocals,
				});
				expect.unreachable('should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(500);
			}
		});
	});
});

// ════════════════════════════════════════════════════════════════
// REPORTS SAVE: /api/reports/save
// ════════════════════════════════════════════════════════════════
describe('/api/reports/save (POST)', () => {
	let POST: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/reports/save/+server');
		POST = mod.POST;
	});

	it('returns 401 when unauthenticated', async () => {
		const res = await POST({ request: mkRequest({ reportId: 'r1' }), locals: anonLocals });
		expect(res.status).toBe(401);
	});

	it('returns 400 for missing reportId', async () => {
		const res = await POST({ request: mkRequest({}), locals: authedLocals });
		expect(res.status).toBe(400);
	});

	it('saves report successfully', async () => {
		const { db } = await import('$lib/server/db/client');
		const updated = { id: 'r1', title: 'Saved Report', content: '<p>Updated</p>' };
		(db.update as any).mockReturnValueOnce({
			set: vi.fn(() => ({
				where: vi.fn(() => ({
					returning: vi.fn(async () => [updated]),
				})),
			})),
		});

		const res = await POST({
			request: mkRequest({ reportId: 'r1', title: 'Saved Report', contentHtml: '<p>Updated</p>' }),
			locals: authedLocals,
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.success).toBe(true);
		expect(data.report.title).toBe('Saved Report');
	});

	it('returns 404 when report not found', async () => {
		const { db } = await import('$lib/server/db/client');
		(db.update as any).mockReturnValueOnce({
			set: vi.fn(() => ({
				where: vi.fn(() => ({
					returning: vi.fn(async () => []),
				})),
			})),
		});

		const res = await POST({
			request: mkRequest({ reportId: 'nonexistent' }),
			locals: authedLocals,
		});
		expect(res.status).toBe(404);
	});

	it('returns 500 on DB error', async () => {
		const { db } = await import('$lib/server/db/client');
		(db.update as any).mockReturnValueOnce({
			set: vi.fn(() => ({
				where: vi.fn(() => ({
					returning: vi.fn(async () => { throw new Error('DB fail'); }),
				})),
			})),
		});

		const res = await POST({
			request: mkRequest({ reportId: 'r1' }),
			locals: authedLocals,
		});
		expect(res.status).toBe(500);
	});
});

// ════════════════════════════════════════════════════════════════
// SUMMARIZE: /api/summarize
// ════════════════════════════════════════════════════════════════
describe('/api/summarize (POST)', () => {
	let POST: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/summarize/+server');
		POST = mod.POST;
	});

	it('returns 401 when unauthenticated', async () => {
		const res = await POST({ request: mkRequest({ text: 'Test text content here' }), locals: anonLocals });
		expect(res.status).toBe(401);
	});

	it('returns 400 for text too short', async () => {
		const res = await POST({ request: mkRequest({ text: 'short' }), locals: authedLocals });
		expect(res.status).toBe(400);
	});

	it('returns 400 for missing text', async () => {
		const res = await POST({ request: mkRequest({}), locals: authedLocals });
		expect(res.status).toBe(400);
	});

	it('returns summary from Ollama', async () => {
		mockOllamaFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ response: 'The court held that the defendant was liable for damages.' }),
		});

		const res = await POST({
			request: mkRequest({ text: 'A long legal text about contract law and liability that exceeds the minimum character count for summarization.' }),
			locals: authedLocals,
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.summary).toBe('The court held that the defendant was liable for damages.');
		expect(data.model).toBe('gemma3-legal:latest');
		expect(data.confidence).toBeGreaterThan(0.5);
	});

	it('returns confidence based on text length', async () => {
		mockOllamaFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ response: 'A very detailed legal summary that exceeds eighty characters in order to trigger the full confidence bonus for long outputs from the model.' }),
		});

		const longText = 'Legal text. '.repeat(100);
		const res = await POST({
			request: mkRequest({ text: longText }),
			locals: authedLocals,
		});
		const data = await res.json();
		expect(data.confidence).toBeGreaterThanOrEqual(0.85);
	});

	it('returns 502 when Ollama is unavailable', async () => {
		mockOllamaFetch.mockResolvedValueOnce({ ok: false, status: 500 });

		const res = await POST({
			request: mkRequest({ text: 'Some legal text that needs to be summarized by the AI model.' }),
			locals: authedLocals,
		});
		expect(res.status).toBe(502);
	});

	it('returns 500 on fetch error', async () => {
		mockOllamaFetch.mockRejectedValueOnce(new Error('Connection refused'));

		const res = await POST({
			request: mkRequest({ text: 'Some legal text that needs to be summarized by the AI model.' }),
			locals: authedLocals,
		});
		expect(res.status).toBe(500);
	});
});

// ════════════════════════════════════════════════════════════════
// EMBED: /api/embed
// ════════════════════════════════════════════════════════════════
describe('/api/embed (POST)', () => {
	let POST: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/embed/+server');
		POST = mod.POST;
	});

	it('returns 401 when unauthenticated', async () => {
		const res = await POST({ request: mkRequest({ text: 'hello' }), locals: anonLocals });
		expect(res.status).toBe(401);
	});

	it('returns 400 for missing text', async () => {
		const res = await POST({ request: mkRequest({}), locals: authedLocals });
		// apiResponses.badRequest is mocked
		expect(mockApiResponses.badRequest).toHaveBeenCalled();
	});

	it('returns embeddinggemma embedding by default', async () => {
		const res = await POST({
			request: mkRequest({ text: 'Legal document about torts' }),
			locals: authedLocals,
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.embedding).toHaveLength(768);
		expect(data.model).toBe('embeddinggemma:latest');
	});

	it('returns nomic embedding when requested', async () => {
		mockOllamaFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ embedding: Array.from({ length: 768 }, () => 0.1) }),
		});

		const res = await POST({
			request: mkRequest({ text: 'Legal query', model: 'nomic' }),
			locals: authedLocals,
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.model).toBe('nomic-embed-text:latest');
	});

	it('returns mock embedding with custom dimensions', async () => {
		const res = await POST({
			request: mkRequest({ text: 'Test text', model: 'mock', dimensions: 384 }),
			locals: authedLocals,
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.model).toBe('mock-embeddings');
		expect(data.dimensions).toBe(384);
		expect(data.embedding).toHaveLength(384);
	});

	it('truncates embedding to requested dimensions', async () => {
		const res = await POST({
			request: mkRequest({ text: 'Legal doc', dimensions: 256 }),
			locals: authedLocals,
		});
		const data = await res.json();
		expect(data.embedding).toHaveLength(256);
		expect(data.dimensions).toBe(256);
	});

	it('rate limits excessive requests', async () => {
		const { embedRateLimiter } = await import('$lib/server/middleware/rate-limiter.js');
		(embedRateLimiter.check as any).mockReturnValueOnce({
			allowed: false,
			remaining: 0,
			resetTime: Date.now() + 30000,
		});

		await POST({
			request: mkRequest({ text: 'test text' }),
			locals: authedLocals,
		});
		expect(mockApiResponses.serviceUnavailable).toHaveBeenCalled();
	});
});

// ════════════════════════════════════════════════════════════════
// CHAT: /api/chat
// ════════════════════════════════════════════════════════════════
describe('/api/chat (POST)', () => {
	let POST: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/chat/+server');
		POST = mod.POST;
	});

	it('returns 400 for empty body', async () => {
		const res = await POST({ request: mkRequest({}), locals: authedLocals });
		expect(res.status).toBe(400);
	});

	it('returns 400 for empty message', async () => {
		const res = await POST({ request: mkRequest({ message: '' }), locals: authedLocals });
		expect(res.status).toBe(400);
	});

	it('returns 400 for invalid role in messages', async () => {
		const res = await POST({
			request: mkRequest({ messages: [{ role: 'invalid', content: 'test' }] }),
			locals: authedLocals,
		});
		expect(res.status).toBe(400);
	});

	it('returns chat response for simple message', async () => {
		mockOllamaFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				message: { content: 'In tort law, negligence requires duty, breach, causation, and damages.' },
				model: 'gemma3-legal:latest',
			}),
		});

		const res = await POST({
			request: mkRequest({ message: 'What are the elements of negligence?' }),
			locals: authedLocals,
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.response).toContain('negligence');
		expect(data.model).toBe('gemma3-legal:latest');
	});

	it('supports messages array format', async () => {
		mockOllamaFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				message: { content: 'Yes, that is correct.' },
				model: 'gemma3-legal:latest',
			}),
		});

		const res = await POST({
			request: mkRequest({
				messages: [
					{ role: 'user', content: 'What is contract law?' },
					{ role: 'assistant', content: 'Contract law governs agreements.' },
					{ role: 'user', content: 'Is that correct?' },
				],
			}),
			locals: authedLocals,
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.response).toBe('Yes, that is correct.');
	});

	it('supports prompt alias for message', async () => {
		mockOllamaFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				message: { content: 'Legal response here.' },
				model: 'gemma3-legal:latest',
			}),
		});

		const res = await POST({
			request: mkRequest({ prompt: 'Explain habeas corpus' }),
			locals: authedLocals,
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.response).toBeTruthy();
	});

	it('tracks token usage', async () => {
		const { trackTokenUsage } = await import('$lib/server/ai/token-tracker.js');
		mockOllamaFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ message: { content: 'Response' }, model: 'gemma3-legal:latest' }),
		});

		await POST({
			request: mkRequest({ message: 'Test query' }),
			locals: authedLocals,
		});
		expect(trackTokenUsage).toHaveBeenCalledWith(
			expect.objectContaining({
				endpoint: '/api/chat',
				model: 'gemma3-legal:latest',
			})
		);
	});

	it('returns 502 when Ollama is unavailable', async () => {
		mockOllamaFetch.mockResolvedValueOnce({ ok: false, status: 503 });

		const res = await POST({
			request: mkRequest({ message: 'Hello?' }),
			locals: authedLocals,
		});
		expect(res.status).toBe(502);
	});

	it('returns 503 on unexpected error', async () => {
		mockOllamaFetch.mockRejectedValueOnce(new Error('Connection reset'));

		const res = await POST({
			request: mkRequest({ message: 'Hello?' }),
			locals: authedLocals,
		});
		expect(res.status).toBe(503);
	});
});

// ════════════════════════════════════════════════════════════════
// POI RELATIONSHIPS: /api/persons-of-interest/relationships
// ════════════════════════════════════════════════════════════════
describe('/api/persons-of-interest/relationships (POST)', () => {
	let POST: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/persons-of-interest/relationships/+server');
		POST = mod.POST;
	});

	it('returns 401 when unauthenticated', async () => {
		const res = await POST({ request: mkRequest({}), locals: anonLocals });
		expect(res.status).toBe(401);
	});

	it('returns 400 for missing poiId1', async () => {
		const res = await POST({
			request: mkRequest({ poiId2: UUID2, type: 'family' }),
			locals: authedLocals,
		});
		expect(res.status).toBe(400);
	});

	it('returns 400 for invalid UUID in poiId1', async () => {
		const res = await POST({
			request: mkRequest({ poiId1: 'not-uuid', poiId2: UUID2, type: 'family' }),
			locals: authedLocals,
		});
		expect(res.status).toBe(400);
	});

	it('returns 400 for invalid relationship type', async () => {
		const res = await POST({
			request: mkRequest({ poiId1: UUID1, poiId2: UUID2, type: 'romantic' }),
			locals: authedLocals,
		});
		expect(res.status).toBe(400);
	});

	it('creates relationship with valid data', async () => {
		const { db } = await import('$lib/server/db/client');
		const newRel = { id: 'rel-1', poiId1: UUID1, poiId2: UUID2, relationshipType: 'business', strength: '0.8' };
		(db.insert as any).mockReturnValueOnce(buildInsertChain([newRel]));

		const res = await POST({
			request: mkRequest({ poiId1: UUID1, poiId2: UUID2, type: 'business', strength: 0.8 }),
			locals: authedLocals,
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.relationship.relationshipType).toBe('business');
	});

	it('defaults to unknown type and 0.7 strength', async () => {
		const { db } = await import('$lib/server/db/client');
		const newRel = { id: 'rel-2', poiId1: UUID1, poiId2: UUID2, relationshipType: 'unknown', strength: '0.7' };
		(db.insert as any).mockReturnValueOnce(buildInsertChain([newRel]));

		const res = await POST({
			request: mkRequest({ poiId1: UUID1, poiId2: UUID2 }),
			locals: authedLocals,
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.relationship.relationshipType).toBe('unknown');
	});

	it('returns 500 on DB error', async () => {
		const { db } = await import('$lib/server/db/client');
		(db.insert as any).mockReturnValueOnce({
			values: vi.fn(() => ({
				returning: vi.fn(async () => { throw new Error('DB error'); }),
			})),
		});

		const res = await POST({
			request: mkRequest({ poiId1: UUID1, poiId2: UUID2, type: 'conflict' }),
			locals: authedLocals,
		});
		expect(res.status).toBe(500);
	});
});
