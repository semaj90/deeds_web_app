/**
 * POI + Citations + Conversations API Routes — Unit Tests
 *
 * Tests for:
 *   /api/persons-of-interest (GET/POST)
 *   /api/persons-of-interest/[id] (GET/PATCH/DELETE)
 *   /api/citations (GET/POST/DELETE)
 *   /api/conversations/[id] (PUT/DELETE)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── shared mock fns ────────────────────────────────────────────
const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbDelete = vi.fn();

// ── DB chain builders ──────────────────────────────────────────
function buildSelectChain(data: unknown[] = []) {
	return {
		from: vi.fn(() => ({
			where: vi.fn(() => ({
				orderBy: vi.fn(() => ({
					limit: vi.fn(() => ({
						offset: vi.fn(async () => data),
					})),
				})),
				limit: vi.fn(async () => data),
			})),
			orderBy: vi.fn(() => ({
				limit: vi.fn(() => ({
					offset: vi.fn(async () => data),
				})),
			})),
			limit: vi.fn(async () => data),
		})),
	};
}

const insertChain = {
	values: vi.fn(() => ({
		returning: vi.fn(async () => [
			{
				id: 'poi-new-1',
				name: 'John Doe',
				status: 'surveillance',
				threatLevel: 'low',
				description: '',
				aliases: [],
				relationship: null,
				crimes: [],
				caseIds: [],
				confidence: null,
				createdAt: new Date('2026-03-29'),
				updatedAt: new Date('2026-03-29'),
			},
		]),
		onConflictDoNothing: vi.fn(),
		onConflictDoUpdate: vi.fn(() => ({})),
	})),
};

const updateChain = {
	set: vi.fn(() => ({
		where: vi.fn(() => ({
			returning: vi.fn(async () => [
				{
					id: 'poi-1',
					name: 'Updated Name',
					status: 'active',
					threatLevel: 'high',
					createdAt: new Date('2026-01-01'),
					updatedAt: new Date('2026-03-29'),
				},
			]),
		})),
	})),
};

const deleteChain = {
	where: vi.fn(() => ({
		returning: vi.fn(async () => [{ id: 'poi-1', name: 'John Doe' }]),
	})),
};

// ── Mocks ──────────────────────────────────────────────────────
vi.mock('$lib/server/middleware/cache-headers.js', () => ({
  cacheControl: { private: {}, public: {} },
  checkETag: () => ({ etag: '"test"', isMatch: false }),
  notModified: () => new Response(null, { status: 304 }),
}));

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

vi.mock('$lib/server/env.server.js', () => ({
	ENV: { OLLAMA_BASE_URL: 'http://ollama.test' },
}));

vi.mock('$lib/server/db/client', () => ({
  pgRows: (r) => Array.isArray(r) ? r : r?.rows ?? [],
	db: {
		select: vi.fn(() => buildSelectChain()),
		insert: vi.fn(() => insertChain),
		update: vi.fn(() => updateChain),
		delete: vi.fn(() => deleteChain),
	},
	citations: {
		id: 'id',
		caseId: 'case_id',
		quotedText: 'quoted_text',
		citationType: 'citation_type',
		sourceUrl: 'source_url',
		createdBy: 'created_by',
		createdAt: 'created_at',
	},
	statutes: {
		id: 'id',
		title: 'title',
		content: 'content',
		jurisdiction: 'jurisdiction',
		section: 'section',
		category: 'category',
	},
	personsOfInterest: {
		id: 'id',
		name: 'name',
		description: 'description',
		status: { enumValues: ['surveillance', 'wanted', 'active', 'cleared'] },
		threatLevel: { enumValues: ['low', 'medium', 'high', 'critical'] },
		aliases: 'aliases',
		relationship: 'relationship',
		crimes: 'crimes',
		caseIds: 'case_ids',
		confidence: 'confidence',
		createdAt: 'created_at',
		updatedAt: 'updated_at',
	},
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
	personsOfInterest: {
		id: 'id',
		name: 'name',
		description: 'description',
		status: { enumValues: ['surveillance', 'wanted', 'active', 'cleared'] },
		threatLevel: { enumValues: ['low', 'medium', 'high', 'critical'] },
		aliases: 'aliases',
		relationship: 'relationship',
		crimes: 'crimes',
		caseIds: 'case_ids',
		confidence: 'confidence',
		createdAt: 'created_at',
		updatedAt: 'updated_at',
	},
	poiPhotos: { poiId: 'poi_id' },
	timelineEvents: { poiId: 'poi_id' },
}));

vi.mock('$lib/server/db/schema.js', () => ({
	chatMetadata: { chatId: 'chat_id', userId: 'user_id' },
	chatMessages: { id: 'id', chatId: 'chat_id', userId: 'user_id', role: 'role', content: 'content' },
	reports: {
		id: 'id',
		caseId: 'case_id',
		content: 'content',
		title: 'title',
		type: 'type',
		status: 'status',
		createdBy: 'created_by',
		createdAt: 'created_at',
		metadata: 'metadata',
	},
}));

vi.mock('$lib/server/cache.js', () => ({
	getFromMemoryCache: vi.fn(() => null),
	setCache: vi.fn(),
}));

vi.mock('$lib/server/law-mapping.js', () => ({
	findStateBySlug: vi.fn((slug: string) => slug === 'california' ? { canonical: 'California' } : null),
}));

vi.mock('$lib/server/validation.js', () => ({
	isUuid: (s: string | null | undefined): boolean =>
		typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s),
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

// ── Helpers ────────────────────────────────────────────────────
function mkUrl(path: string, params?: Record<string, string>) {
	const u = new URL(`http://localhost${path}`);
	if (params) Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
	return u;
}

function mkRequest(body?: unknown): Request {
	return new Request('http://localhost/api/test', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: body !== undefined ? JSON.stringify(body) : undefined,
	});
}

function mkDeleteRequest(body?: unknown): Request {
	return new Request('http://localhost/api/test', {
		method: 'DELETE',
		headers: { 'Content-Type': 'application/json' },
		body: body !== undefined ? JSON.stringify(body) : undefined,
	});
}

const authedLocals = { user: { id: 'user-1', email: 'test@test.com', role: 'admin' } } as any;
const anonLocals = { user: null } as any;
const VALID_UUID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

// ── Reset mocks ────────────────────────────────────────────────
beforeEach(() => {
	vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════════
// POI LIST + CREATE: /api/persons-of-interest
// ════════════════════════════════════════════════════════════════
describe('/api/persons-of-interest (GET/POST)', () => {
	let GET: Function, POST: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/persons-of-interest/+server');
		GET = mod.GET;
		POST = mod.POST;
	});

	// ── GET ──
	describe('GET', () => {
		it('returns paginated list with defaults', async () => {
			const { db } = await import('$lib/server/db/client');
			const mockItems = [{ id: 'poi-1', name: 'Jane Smith', status: 'active' }];
			const mockCount = [{ count: 1 }];

			// Make db.select return items for first call, count for second
			(db.select as any)
				.mockReturnValueOnce(buildSelectChain(mockItems))
				.mockReturnValueOnce(buildSelectChain(mockCount));

			const res = await GET({
				url: mkUrl('/api/persons-of-interest'),
			});
			const data = await res.json();
			expect(res.status).toBe(200);
			expect(data).toHaveProperty('persons');
			expect(data).toHaveProperty('total');
			expect(data).toHaveProperty('page');
			expect(data).toHaveProperty('totalPages');
		});

		it('returns empty list gracefully on DB error', async () => {
			const { db } = await import('$lib/server/db/client');
			(db.select as any).mockReturnValueOnce({
				from: vi.fn(() => { throw new Error('DB down'); }),
			});

			const res = await GET({
				url: mkUrl('/api/persons-of-interest'),
			});
			const data = await res.json();
			expect(res.status).toBe(200);
			expect(data.persons).toEqual([]);
			expect(data.total).toBe(0);
		});

		it('applies status filter', async () => {
			const { db } = await import('$lib/server/db/client');
			(db.select as any)
				.mockReturnValueOnce(buildSelectChain([]))
				.mockReturnValueOnce(buildSelectChain([{ count: 0 }]));

			const res = await GET({
				url: mkUrl('/api/persons-of-interest', { status: 'wanted' }),
			});
			expect(res.status).toBe(200);
		});

		it('applies threatLevel filter', async () => {
			const { db } = await import('$lib/server/db/client');
			(db.select as any)
				.mockReturnValueOnce(buildSelectChain([]))
				.mockReturnValueOnce(buildSelectChain([{ count: 0 }]));

			const res = await GET({
				url: mkUrl('/api/persons-of-interest', { threatLevel: 'critical' }),
			});
			expect(res.status).toBe(200);
		});

		it('applies search filter', async () => {
			const { db } = await import('$lib/server/db/client');
			(db.select as any)
				.mockReturnValueOnce(buildSelectChain([]))
				.mockReturnValueOnce(buildSelectChain([{ count: 0 }]));

			const res = await GET({
				url: mkUrl('/api/persons-of-interest', { search: 'john' }),
			});
			expect(res.status).toBe(200);
		});

		it('rejects invalid page number', async () => {
			const res = await GET({
				url: mkUrl('/api/persons-of-interest', { page: '0' }),
			});
			expect(res.status).toBe(400);
		});

		it('rejects limit > 100', async () => {
			const res = await GET({
				url: mkUrl('/api/persons-of-interest', { limit: '200' }),
			});
			expect(res.status).toBe(400);
		});
	});

	// ── POST ──
	describe('POST', () => {
		it('returns 401 when unauthenticated', async () => {
			const res = await POST({
				request: mkRequest({ name: 'Test' }),
				locals: anonLocals,
			});
			expect(res.status).toBe(401);
		});

		it('returns 400 for missing name', async () => {
			const res = await POST({
				request: mkRequest({}),
				locals: authedLocals,
			});
			expect(res.status).toBe(400);
		});

		it('returns 400 for empty name', async () => {
			const res = await POST({
				request: mkRequest({ name: '' }),
				locals: authedLocals,
			});
			expect(res.status).toBe(400);
		});

		it('returns 400 for invalid status enum', async () => {
			const res = await POST({
				request: mkRequest({ name: 'Test', status: 'banana' }),
				locals: authedLocals,
			});
			expect(res.status).toBe(400);
		});

		it('returns 400 for invalid threatLevel enum', async () => {
			const res = await POST({
				request: mkRequest({ name: 'Test', threatLevel: 'extreme' }),
				locals: authedLocals,
			});
			expect(res.status).toBe(400);
		});

		it('creates POI with valid data', async () => {
			const res = await POST({
				request: mkRequest({ name: 'Jane Doe', description: 'Suspect' }),
				locals: authedLocals,
			});
			const data = await res.json();
			expect(res.status).toBe(201);
			expect(data.name).toBe('John Doe'); // from mock insertChain
		});

		it('creates POI with all optional fields', async () => {
			const res = await POST({
				request: mkRequest({
					name: 'Full Person',
					description: 'Full desc',
					status: 'wanted',
					threatLevel: 'critical',
					aliases: ['Alias1'],
					relationship: 'Business partner',
					crimes: ['fraud'],
					caseIds: [VALID_UUID],
				}),
				locals: authedLocals,
			});
			expect(res.status).toBe(201);
		});

		it('returns 500 on DB error', async () => {
			const { db } = await import('$lib/server/db/client');
			(db.insert as any).mockReturnValueOnce({
				values: vi.fn(() => ({
					returning: vi.fn(async () => { throw new Error('DB error'); }),
				})),
			});

			const res = await POST({
				request: mkRequest({ name: 'Test Person' }),
				locals: authedLocals,
			});
			expect(res.status).toBe(500);
		});
	});
});

// ════════════════════════════════════════════════════════════════
// POI SINGLE: /api/persons-of-interest/[id]
// ════════════════════════════════════════════════════════════════
describe('/api/persons-of-interest/[id] (GET/PATCH/DELETE)', () => {
	let GET: Function, PATCH: Function, DELETE: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/persons-of-interest/[id]/+server');
		GET = mod.GET;
		PATCH = mod.PATCH;
		DELETE = mod.DELETE;
	});

	// ── GET ──
	describe('GET', () => {
		it('returns 401 when unauthenticated', async () => {
			const res = await GET({
				params: { id: VALID_UUID },
				request: new Request('http://localhost'), locals: anonLocals,
			});
			expect(res.status).toBe(401);
		});

		it('returns 400 for invalid UUID', async () => {
			const res = await GET({
				params: { id: 'not-a-uuid' },
				request: new Request('http://localhost'), locals: authedLocals,
			});
			expect(res.status).toBe(400);
		});

		it('returns 404 when not found', async () => {
			const { db } = await import('$lib/server/db/client');
			(db.select as any).mockReturnValueOnce({
				from: vi.fn(() => ({
					where: vi.fn(() => ({
						limit: vi.fn(async () => []),
					})),
				})),
			});

			const res = await GET({
				params: { id: VALID_UUID },
				request: new Request('http://localhost'), locals: authedLocals,
			});
			expect(res.status).toBe(404);
		});

		it('returns POI when found', async () => {
			const { db } = await import('$lib/server/db/client');
			const poi = {
				id: VALID_UUID,
				name: 'Test Person',
				status: 'active',
				threatLevel: 'medium',
				caseIds: ['case-1'],
				createdAt: new Date('2026-01-01'),
				updatedAt: new Date('2026-03-29'),
			};
			(db.select as any).mockReturnValueOnce({
				from: vi.fn(() => ({
					where: vi.fn(() => ({
						limit: vi.fn(async () => [poi]),
					})),
				})),
			});

			const res = await GET({
				params: { id: VALID_UUID },
				request: new Request('http://localhost'), locals: authedLocals,
			});
			const data = await res.json();
			expect(res.status).toBe(200);
			expect(data.name).toBe('Test Person');
			expect(data.caseId).toBe('case-1');
			expect(data.createdAt).toContain('2026');
		});
	});

	// ── PATCH ──
	describe('PATCH', () => {
		it('returns 401 when unauthenticated', async () => {
			const res = await PATCH({
				params: { id: VALID_UUID },
				request: mkRequest({ name: 'Updated' }),
				locals: anonLocals,
			});
			expect(res.status).toBe(401);
		});

		it('returns 400 for invalid UUID', async () => {
			const res = await PATCH({
				params: { id: 'nope' },
				request: mkRequest({ name: 'Updated' }),
				locals: authedLocals,
			});
			expect(res.status).toBe(400);
		});

		it('returns 400 for invalid threatLevel', async () => {
			const res = await PATCH({
				params: { id: VALID_UUID },
				request: mkRequest({ threatLevel: 'extreme' }),
				locals: authedLocals,
			});
			expect(res.status).toBe(400);
		});

		it('updates POI with valid data', async () => {
			const res = await PATCH({
				params: { id: VALID_UUID },
				request: mkRequest({ name: 'Updated Name', threatLevel: 'high' }),
				locals: authedLocals,
			});
			const data = await res.json();
			expect(res.status).toBe(200);
			expect(data.name).toBe('Updated Name');
		});

		it('returns 404 when POI not found', async () => {
			const { db } = await import('$lib/server/db/client');
			(db.update as any).mockReturnValueOnce({
				set: vi.fn(() => ({
					where: vi.fn(() => ({
						returning: vi.fn(async () => []),
					})),
				})),
			});

			const res = await PATCH({
				params: { id: VALID_UUID },
				request: mkRequest({ name: 'Ghost' }),
				locals: authedLocals,
			});
			expect(res.status).toBe(404);
		});
	});

	// ── DELETE ──
	describe('DELETE', () => {
		it('returns 401 when unauthenticated', async () => {
			const res = await DELETE({
				params: { id: VALID_UUID },
				request: new Request('http://localhost'), locals: anonLocals,
			});
			expect(res.status).toBe(401);
		});

		it('returns 400 for invalid UUID', async () => {
			const res = await DELETE({
				params: { id: 'bad' },
				request: new Request('http://localhost'), locals: authedLocals,
			});
			expect(res.status).toBe(400);
		});

		it('deletes POI when found', async () => {
			const res = await DELETE({
				params: { id: VALID_UUID },
				request: new Request('http://localhost'), locals: authedLocals,
			});
			const data = await res.json();
			expect(res.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.deleted).toHaveProperty('id');
		});

		it('returns 404 when POI not found', async () => {
			const { db } = await import('$lib/server/db/client');
			// All three delete calls need to work, but the last returning() returns empty
			(db.delete as any)
				.mockReturnValueOnce({ where: vi.fn(async () => []) }) // timelineEvents
				.mockReturnValueOnce({ where: vi.fn(async () => []) }) // poiPhotos
				.mockReturnValueOnce({
					where: vi.fn(() => ({
						returning: vi.fn(async () => []),
					})),
				}); // personsOfInterest

			const res = await DELETE({
				params: { id: VALID_UUID },
				request: new Request('http://localhost'), locals: authedLocals,
			});
			expect(res.status).toBe(404);
		});
	});
});

// ════════════════════════════════════════════════════════════════
// CITATIONS: /api/citations
// ════════════════════════════════════════════════════════════════
describe('/api/citations (GET/POST/DELETE)', () => {
	let GET: Function, POST: Function, DELETE: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/citations/+server');
		GET = mod.GET;
		POST = mod.POST;
		DELETE = mod.DELETE;
	});

	// ── GET ──
	describe('GET', () => {
		it('returns 401 when unauthenticated', async () => {
			try {
				await GET({ url: mkUrl('/api/citations'), request: new Request('http://localhost'), locals: anonLocals });
				expect.unreachable('should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(401);
			}
		});

		it('returns citations list', async () => {
			const { db } = await import('$lib/server/db/client');
			const mockCitations = [{ id: 'cit-1', quotedText: '§ 123' }];
			(db.select as any).mockReturnValueOnce({
				from: vi.fn(() => ({
					orderBy: vi.fn(() => ({
						limit: vi.fn(async () => mockCitations),
					})),
				})),
			});

			const res = await GET({
				url: mkUrl('/api/citations'),
				request: new Request('http://localhost'), locals: authedLocals,
			});
			const data = await res.json();
			expect(res.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.citations).toEqual(mockCitations);
		});

		it('returns cached results when available', async () => {
			const { getFromMemoryCache } = await import('$lib/server/cache.js');
			(getFromMemoryCache as any).mockReturnValueOnce([{ id: 'cached-1' }]);

			const res = await GET({
				url: mkUrl('/api/citations'),
				request: new Request('http://localhost'), locals: authedLocals,
			});
			const data = await res.json();
			expect(data.cache).toBe(true);
			expect(data.citations).toHaveLength(1);
		});

		it('filters by case_id', async () => {
			const { db } = await import('$lib/server/db/client');
			(db.select as any).mockReturnValueOnce({
				from: vi.fn(() => ({
					orderBy: vi.fn(() => ({
						limit: vi.fn(async () => []),
					})),
				})),
			});

			const res = await GET({
				url: mkUrl('/api/citations', { case_id: VALID_UUID }),
				request: new Request('http://localhost'), locals: authedLocals,
			});
			expect(res.status).toBe(200);
		});

		it('returns empty on DB error (graceful degradation)', async () => {
			const { db } = await import('$lib/server/db/client');
			(db.select as any).mockReturnValueOnce({
				from: vi.fn(() => ({
					orderBy: vi.fn(() => ({
						limit: vi.fn(async () => { throw new Error('DB down'); }),
					})),
				})),
			});

			const res = await GET({
				url: mkUrl('/api/citations'),
				request: new Request('http://localhost'), locals: authedLocals,
			});
			const data = await res.json();
			expect(res.status).toBe(200);
			expect(data.success).toBe(false);
			expect(data.citations).toEqual([]);
		});
	});

	// ── POST ──
	describe('POST', () => {
		it('returns 401 when unauthenticated', async () => {
			try {
				await POST({ request: mkRequest({ statute_code: 'test' }), locals: anonLocals });
				expect.unreachable('should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(401);
			}
		});

		it('returns 400 for missing statute_code', async () => {
			const res = await POST({
				request: mkRequest({}),
				locals: authedLocals,
			});
			expect(res.status).toBe(400);
		});

		it('creates citation with minimal data', async () => {
			const { db } = await import('$lib/server/db/client');
			const newCitation = { id: 'cit-new', quotedText: '§ 456', citationType: 'statute' };
			(db.insert as any).mockReturnValueOnce({
				values: vi.fn(() => ({
					returning: vi.fn(async () => [newCitation]),
				})),
			});

			const res = await POST({
				request: mkRequest({ statute_code: '§ 456' }),
				locals: authedLocals,
			});
			const data = await res.json();
			expect(res.status).toBe(201);
			expect(data.success).toBe(true);
			expect(data.citation).toEqual(newCitation);
			expect(data.statute).toBeNull();
		});

		it('creates citation with statute upsert', async () => {
			const { db } = await import('$lib/server/db/client');
			// First insert: statute upsert
			(db.insert as any).mockReturnValueOnce({
				values: vi.fn(() => ({
					returning: vi.fn(async () => [{ id: 'statute-new' }]),
				})),
			});
			// Second insert: citation creation
			(db.insert as any).mockReturnValueOnce({
				values: vi.fn(() => ({
					returning: vi.fn(async () => [{ id: 'cit-new', quotedText: '§ 789' }]),
				})),
			});

			const res = await POST({
				request: mkRequest({
					statute_code: '§ 789',
					statute_title: 'Fraud Act',
					jurisdiction: 'california',
					case_id: VALID_UUID,
				}),
				locals: authedLocals,
			});
			const data = await res.json();
			expect(res.status).toBe(201);
			expect(data.statute).toEqual({ id: 'statute-new' });
		});
	});

	// ── DELETE ──
	describe('DELETE', () => {
		it('returns 401 when unauthenticated', async () => {
			try {
				await DELETE({ request: mkDeleteRequest({ citationId: 'x' }), locals: anonLocals });
				expect.unreachable('should have thrown');
			} catch (err: any) {
				expect(err.status).toBe(401);
			}
		});

		it('returns 400 for missing citationId', async () => {
			const res = await DELETE({
				request: mkDeleteRequest({}),
				locals: authedLocals,
			});
			expect(res.status).toBe(400);
		});

		it('deletes citation and returns success', async () => {
			const { db } = await import('$lib/server/db/client');
			(db.delete as any).mockReturnValueOnce({
				where: vi.fn(() => ({
					returning: vi.fn(async () => [{ id: 'cit-1' }]),
				})),
			});

			const res = await DELETE({
				request: mkDeleteRequest({ citationId: 'cit-1' }),
				locals: authedLocals,
			});
			const data = await res.json();
			expect(data.success).toBe(true);
		});

		it('returns 404 when citation not found', async () => {
			const { db } = await import('$lib/server/db/client');
			(db.delete as any).mockReturnValueOnce({
				where: vi.fn(() => ({
					returning: vi.fn(async () => []),
				})),
			});

			const res = await DELETE({
				request: mkDeleteRequest({ citationId: 'nonexistent' }),
				locals: authedLocals,
			});
			expect(res.status).toBe(404);
		});
	});
});

// ════════════════════════════════════════════════════════════════
// CONVERSATIONS: /api/conversations/[id]
// ════════════════════════════════════════════════════════════════
describe('/api/conversations/[id] (PUT/DELETE)', () => {
	let PUT: Function, DELETE: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/conversations/[id]/+server');
		PUT = mod.PUT;
		DELETE = mod.DELETE;
	});

	// ── PUT ──
	describe('PUT', () => {
		it('returns 401 when unauthenticated', async () => {
			const res = await PUT({
				params: { id: VALID_UUID },
				request: mkRequest({ title: 'Test' }),
				locals: anonLocals,
			});
			expect(res.status).toBe(401);
		});

		it('returns 400 for invalid UUID', async () => {
			const res = await PUT({
				params: { id: 'not-uuid' },
				request: mkRequest({ title: 'Test' }),
				locals: authedLocals,
			});
			expect(res.status).toBe(400);
		});

		it('returns 400 for invalid message role', async () => {
			const res = await PUT({
				params: { id: VALID_UUID },
				request: mkRequest({
					messages: [{ role: 'hacker', content: 'hi' }],
				}),
				locals: authedLocals,
			});
			expect(res.status).toBe(400);
		});

		it('saves conversation with title only', async () => {
			const { db } = await import('$lib/server/db/client');
			(db.insert as any).mockReturnValue({
				values: vi.fn(() => ({
					onConflictDoUpdate: vi.fn(() => ({})),
					onConflictDoNothing: vi.fn(),
				})),
			});

			const res = await PUT({
				params: { id: VALID_UUID },
				request: mkRequest({ title: 'My Chat' }),
				locals: authedLocals,
			});
			const data = await res.json();
			expect(res.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.conversationId).toBe(VALID_UUID);
		});

		it('saves conversation with messages', async () => {
			const { db } = await import('$lib/server/db/client');
			(db.insert as any).mockReturnValue({
				values: vi.fn(() => ({
					onConflictDoUpdate: vi.fn(() => ({})),
					onConflictDoNothing: vi.fn(),
				})),
			});

			const res = await PUT({
				params: { id: VALID_UUID },
				request: mkRequest({
					title: 'Test Chat',
					messages: [
						{ role: 'user', content: 'Hello' },
						{ role: 'assistant', content: 'Hi!' },
					],
				}),
				locals: authedLocals,
			});
			const data = await res.json();
			expect(res.status).toBe(200);
			expect(data.success).toBe(true);
		});

		it('returns 500 on DB error', async () => {
			const { db } = await import('$lib/server/db/client');
			(db.insert as any).mockReturnValueOnce({
				values: vi.fn(() => ({
					onConflictDoUpdate: vi.fn(() => { throw new Error('DB error'); }),
				})),
			});

			const res = await PUT({
				params: { id: VALID_UUID },
				request: mkRequest({ title: 'Crash' }),
				locals: authedLocals,
			});
			expect(res.status).toBe(500);
		});
	});

	// ── DELETE ──
	describe('DELETE', () => {
		it('returns 401 when unauthenticated', async () => {
			const res = await DELETE({
				params: { id: VALID_UUID },
				request: new Request('http://localhost'), locals: anonLocals,
			});
			expect(res.status).toBe(401);
		});

		it('returns 400 for invalid UUID', async () => {
			const res = await DELETE({
				params: { id: 'bad-id' },
				request: new Request('http://localhost'), locals: authedLocals,
			});
			expect(res.status).toBe(400);
		});

		it('deletes conversation and messages', async () => {
			const { db } = await import('$lib/server/db/client');
			(db.delete as any).mockReturnValue({
				where: vi.fn(async () => []),
			});

			const res = await DELETE({
				params: { id: VALID_UUID },
				request: new Request('http://localhost'), locals: authedLocals,
			});
			const data = await res.json();
			expect(data.success).toBe(true);
		});

		it('returns 500 on DB error', async () => {
			const { db } = await import('$lib/server/db/client');
			(db.delete as any).mockReturnValueOnce({
				where: vi.fn(() => { throw new Error('DB error'); }),
			});

			const res = await DELETE({
				params: { id: VALID_UUID },
				request: new Request('http://localhost'), locals: authedLocals,
			});
			expect(res.status).toBe(500);
		});
	});
});
