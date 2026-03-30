/**
 * Cases + Auth + Evidence API Routes — Unit Tests
 *
 * Tests for: /api/cases (GET/POST/PATCH/DELETE), /api/auth/me,
 *            /api/auth/login, /api/auth/register,
 *            /api/evidence (GET)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── shared mock fns ────────────────────────────────────────────
const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbDelete = vi.fn();
const mockDbExecute = vi.fn();
const mockPoolQuery = vi.fn();

const selectChain = {
	from: vi.fn(() => ({
		where: vi.fn(() => ({
			orderBy: vi.fn(() => ({
				limit: vi.fn(() => ({
					offset: vi.fn(() => ({
						$withCache: vi.fn(async () => []),
					})),
					$withCache: vi.fn(async () => []),
				})),
			})),
			limit: vi.fn(async () => []),
		})),
	})),
};
const insertChain = {
	values: vi.fn(() => ({
		returning: vi.fn(async () => [
			{
				id: 'case-new-1',
				title: 'Test Case',
				description: 'Desc',
				userId: 'user-1',
				status: 'open',
				priority: 'medium',
				createdAt: '2026-03-29',
				updatedAt: '2026-03-29',
			},
		]),
		onConflictDoNothing: vi.fn(),
	})),
};
const updateChain = {
	set: vi.fn(() => ({
		where: vi.fn(() => ({
			returning: vi.fn(async () => [{ id: 'case-1', status: 'closed' }]),
		})),
	})),
};

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

vi.mock('$lib/server/env.server.js', () => ({
	ENV: { OLLAMA_BASE_URL: 'http://ollama.test' },
}));

vi.mock('$lib/server/db/client', () => ({
	db: {
		select: vi.fn(() => selectChain),
		insert: vi.fn(() => insertChain),
		update: vi.fn(() => updateChain),
		delete: vi.fn(() => ({ where: vi.fn(async () => []) })),
		execute: mockDbExecute,
	},
	cases: {
		id: 'id',
		userId: 'user_id',
		title: 'title',
		description: 'description',
		status: { enumValues: ['open', 'in_progress', 'pending_review', 'closed', 'archived'] },
		priority: { enumValues: ['low', 'medium', 'high', 'urgent'] },
		updatedAt: 'updated_at',
		createdAt: 'created_at',
	},
	pool: { query: mockPoolQuery },
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
	evidence: {
		id: 'id',
		caseId: 'case_id',
		title: 'title',
		description: 'description',
		type: 'type',
		evidenceType: 'evidence_type',
		fileName: 'file_name',
		fileType: 'file_type',
		fileSize: 'file_size',
		mimeType: 'mime_type',
		fileUrl: 'file_url',
		evidenceNumber: 'evidence_number',
		source: 'source',
		summary: 'summary',
		tags: 'tags',
		aiTags: 'ai_tags',
		collectedAt: 'collected_at',
		collectedBy: 'collected_by',
		createdAt: 'created_at',
		updatedAt: 'updated_at',
	},
}));

vi.mock('$lib/server/db/schema', () => ({
	users: {
		id: 'id',
		email: 'email',
		passwordHash: 'password_hash',
		firstName: 'first_name',
		lastName: 'last_name',
		role: 'role',
		isActive: 'is_active',
		avatarUrl: 'avatar_url',
		createdAt: 'created_at',
		updatedAt: 'updated_at',
	},
}));

vi.mock('drizzle-orm', () => ({
	eq: vi.fn((...args: unknown[]) => args),
	desc: vi.fn((col: unknown) => col),
	and: vi.fn((...args: unknown[]) => args),
	or: vi.fn((...args: unknown[]) => args),
	like: vi.fn(),
	ilike: vi.fn(),
	inArray: vi.fn(),
	sql: Object.assign(vi.fn(), { raw: vi.fn((s: string) => s) }),
}));

vi.mock('$lib/server/api/response-helper.js', () => ({
	apiResponses: {
		ok: (data: unknown) => new Response(JSON.stringify({ success: true, data, timestamp: Date.now() }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
		created: (data: unknown) => new Response(JSON.stringify({ success: true, data, timestamp: Date.now() }), { status: 201, headers: { 'Content-Type': 'application/json' } }),
		badRequest: (error: string) => new Response(JSON.stringify({ success: false, error, timestamp: Date.now() }), { status: 400, headers: { 'Content-Type': 'application/json' } }),
		unauthorized: (error = 'Unauthorized') => new Response(JSON.stringify({ success: false, error, timestamp: Date.now() }), { status: 401, headers: { 'Content-Type': 'application/json' } }),
		notFound: (error = 'Not found') => new Response(JSON.stringify({ success: false, error, timestamp: Date.now() }), { status: 404, headers: { 'Content-Type': 'application/json' } }),
		serverError: (error: string) => new Response(JSON.stringify({ success: false, error, timestamp: Date.now() }), { status: 500, headers: { 'Content-Type': 'application/json' } }),
	},
	validateRequest: vi.fn(),
}));

vi.mock('$lib/server/auth-helpers.js', () => ({
	requireAuth: vi.fn(async (event: any) => ({
		user: event.locals.user ?? { id: 'user-1', email: 'test@test.com', role: 'admin' },
		session: {},
		isTestMode: true,
	})),
	getUserWithFallback: vi.fn(async (event: any) => ({
		user: event.locals.user ?? { id: 'user-1', email: 'test@test.com', role: 'admin' },
		session: {},
		isTestMode: true,
	})),
}));

vi.mock('$lib/server/cache/invalidation.js', () => ({
	invalidateCaseCache: vi.fn(async () => {}),
}));

vi.mock('$lib/server/queue/rabbitmq-manager-fixed.js', () => ({
	rabbitmq: { publishAnalyticsEvent: vi.fn(async () => {}) },
}));

vi.mock('$lib/server/lucia', () => ({
	createUserSession: vi.fn(async (userId: string) => ({
		sessionId: 'session-123',
		userId,
		expiresAt: new Date(Date.now() + 86400000),
	})),
	setSessionCookie: vi.fn(),
	verifyPassword: vi.fn(async (plain: string, hash: string) => plain === 'correct-password'),
	hashPassword: vi.fn(async (plain: string) => '$2b$10$hashedpassword'),
}));

vi.mock('$lib/server/errors.js', () => ({
	formatErrorResponse: vi.fn((err: unknown) => ({
		error: { message: 'Internal error', status: 500 },
	})),
	ERROR_CODES: {
		INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
		ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
		EMAIL_TAKEN: 'EMAIL_TAKEN',
	},
}));

// ── helpers ────────────────────────────────────────────────────
function makeEvent(
	method: string,
	body?: unknown,
	opts: {
		user?: { id: string; email?: string; role?: string } | null;
		searchParams?: URLSearchParams;
		params?: Record<string, string>;
		cookies?: Record<string, string>;
	} = {},
) {
	const url = new URL('http://localhost:5173/api/test');
	if (opts.searchParams) {
		opts.searchParams.forEach((v, k) => url.searchParams.set(k, v));
	}
	const init: RequestInit = {
		method,
		headers: { 'Content-Type': 'application/json' },
	};
	if (body !== undefined) init.body = JSON.stringify(body);

	const cookieStore: Record<string, string> = opts.cookies ?? {};
	return {
		request: new Request(url.toString(), init),
		params: opts.params ?? {},
		url,
		locals: {
			user: opts.user === null ? undefined : (opts.user ?? { id: 'user-1', email: 'test@test.com', role: 'admin' }),
			session: {},
		},
		cookies: {
			get: vi.fn((name: string) => cookieStore[name]),
			set: vi.fn(),
			delete: vi.fn(),
			getAll: vi.fn(() => []),
			serialize: vi.fn(),
		},
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mockDbExecute.mockResolvedValue({ rows: [] });
});

afterEach(() => {
	vi.restoreAllMocks();
});

// ════════════════════════════════════════════════════════════════
//  /api/auth/me
// ════════════════════════════════════════════════════════════════
describe('GET /api/auth/me', () => {
	let GET: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/auth/me/+server.ts');
		GET = mod.GET;
	});

	it('returns user when authenticated', async () => {
		const event = makeEvent('GET');
		const res = await GET(event);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.user).toBeDefined();
		expect(body.user.id).toBe('user-1');
	});

	it('returns 401 when not authenticated', async () => {
		const event = makeEvent('GET', undefined, { user: null });
		event.locals.user = null;
		const res = await GET(event);
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.user).toBeNull();
	});
});

// ════════════════════════════════════════════════════════════════
//  /api/auth/login
// ════════════════════════════════════════════════════════════════
describe('POST /api/auth/login', () => {
	let POST: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/auth/login/+server.ts');
		POST = mod.POST;
	});

	it('rejects missing email', async () => {
		const event = makeEvent('POST', { password: 'test123' });
		const res = await POST(event);
		expect(res.status).toBe(400);
	});

	it('rejects invalid email format', async () => {
		const event = makeEvent('POST', { email: 'not-an-email', password: 'test123' });
		const res = await POST(event);
		expect(res.status).toBe(400);
	});

	it('rejects missing password', async () => {
		const event = makeEvent('POST', { email: 'user@example.com' });
		const res = await POST(event);
		expect(res.status).toBe(400);
	});

	it('returns 401 for non-existent user', async () => {
		// select returns empty (no user found)
		selectChain.from.mockReturnValueOnce({
			where: vi.fn(() => ({
				limit: vi.fn(async () => []),
			})),
		});

		const event = makeEvent('POST', { email: 'unknown@example.com', password: 'test' });
		const res = await POST(event);
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.error).toContain('Invalid');
	});

	it('returns success for valid credentials', async () => {
		selectChain.from.mockReturnValueOnce({
			where: vi.fn(() => ({
				limit: vi.fn(async () => [
					{
						id: 'user-1',
						email: 'test@example.com',
						passwordHash: '$2b$10$hash',
						firstName: 'Test',
						lastName: 'User',
						role: 'prosecutor',
						isActive: true,
						avatarUrl: null,
					},
				]),
			})),
		});

		const event = makeEvent('POST', {
			email: 'test@example.com',
			password: 'correct-password',
		});
		const res = await POST(event);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.success).toBe(true);
		expect(body.userId).toBe('user-1');
		expect(body.sessionId).toBeDefined();
	});

	it('returns 403 for inactive user', async () => {
		selectChain.from.mockReturnValueOnce({
			where: vi.fn(() => ({
				limit: vi.fn(async () => [
					{
						id: 'user-2',
						email: 'inactive@example.com',
						passwordHash: '$2b$10$hash',
						firstName: 'Inactive',
						lastName: 'User',
						role: 'prosecutor',
						isActive: false,
						avatarUrl: null,
					},
				]),
			})),
		});

		const event = makeEvent('POST', {
			email: 'inactive@example.com',
			password: 'correct-password',
		});
		const res = await POST(event);
		expect(res.status).toBe(403);
		const body = await res.json();
		expect(body.error).toContain('inactive');
	});
});

// ════════════════════════════════════════════════════════════════
//  /api/auth/register
// ════════════════════════════════════════════════════════════════
describe('POST /api/auth/register', () => {
	let POST: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/auth/register/+server.ts');
		POST = mod.POST;
	});

	it('rejects invalid email', async () => {
		const event = makeEvent('POST', {
			email: 'not-email',
			password: 'password123',
			firstName: 'Test',
			lastName: 'User',
		});
		const res = await POST(event);
		expect(res.status).toBe(400);
	});

	it('rejects short password', async () => {
		const event = makeEvent('POST', {
			email: 'new@example.com',
			password: 'short',
			firstName: 'Test',
			lastName: 'User',
		});
		const res = await POST(event);
		expect(res.status).toBe(400);
	});

	it('rejects missing firstName', async () => {
		const event = makeEvent('POST', {
			email: 'new@example.com',
			password: 'password123',
			lastName: 'User',
		});
		const res = await POST(event);
		expect(res.status).toBe(400);
	});

	it('returns 409 for duplicate email', async () => {
		selectChain.from.mockReturnValueOnce({
			where: vi.fn(() => ({
				limit: vi.fn(async () => [{ id: 'existing-user', email: 'dup@example.com' }]),
			})),
		});

		const event = makeEvent('POST', {
			email: 'dup@example.com',
			password: 'password123',
			firstName: 'Test',
			lastName: 'User',
		});
		const res = await POST(event);
		expect(res.status).toBe(409);
		const body = await res.json();
		expect(body.error).toContain('already registered');
	});

	it('creates user on valid input', async () => {
		// No existing user
		selectChain.from.mockReturnValueOnce({
			where: vi.fn(() => ({
				limit: vi.fn(async () => []),
			})),
		});

		const event = makeEvent('POST', {
			email: 'new@example.com',
			password: 'securePw123!',
			firstName: 'New',
			lastName: 'User',
		});
		const res = await POST(event);
		// 200 or 201 — both valid for registration
		expect(res.status).toBeLessThan(300);
		const body = await res.json();
		expect(body.success).toBe(true);
	});
});

// ════════════════════════════════════════════════════════════════
//  /api/cases (GET)
// ════════════════════════════════════════════════════════════════
describe('GET /api/cases', () => {
	let GET: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/cases/+server.ts');
		GET = mod.GET;
	});

	it('rejects unauthenticated requests', async () => {
		const event = makeEvent('GET', undefined, { user: null });
		event.locals.user = undefined;
		const res = await GET(event);
		expect(res.status).toBe(401);
	});

	it('returns cases with default params', async () => {
		const event = makeEvent('GET', undefined, {
			searchParams: new URLSearchParams(),
		});
		const res = await GET(event);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.success).toBe(true);
		expect(body.data.cases).toBeDefined();
		expect(body.data.pagination).toBeDefined();
	});

	it('respects limit and offset', async () => {
		const event = makeEvent('GET', undefined, {
			searchParams: new URLSearchParams({ limit: '5', offset: '10' }),
		});
		const res = await GET(event);
		expect(res.status).toBe(200);
	});

	it('filters by status', async () => {
		const event = makeEvent('GET', undefined, {
			searchParams: new URLSearchParams({ status: 'open' }),
		});
		const res = await GET(event);
		expect(res.status).toBe(200);
	});

	it('filters by priority', async () => {
		const event = makeEvent('GET', undefined, {
			searchParams: new URLSearchParams({ priority: 'high' }),
		});
		const res = await GET(event);
		expect(res.status).toBe(200);
	});

	it('handles search param', async () => {
		const event = makeEvent('GET', undefined, {
			searchParams: new URLSearchParams({ search: 'murder' }),
		});
		const res = await GET(event);
		expect(res.status).toBe(200);
	});
});

// ════════════════════════════════════════════════════════════════
//  /api/cases (POST)
// ════════════════════════════════════════════════════════════════
describe('POST /api/cases', () => {
	let POST: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/cases/+server.ts');
		POST = mod.POST;
	});

	it('rejects unauthenticated requests', async () => {
		const event = makeEvent('POST', { title: 'Test', description: 'Desc' }, { user: null });
		event.locals.user = undefined;
		const res = await POST(event);
		expect(res.status).toBe(401);
	});

	it('rejects missing title', async () => {
		const event = makeEvent('POST', { description: 'A test case' });
		const res = await POST(event);
		expect(res.status).toBe(400);
	});

	it('rejects missing description', async () => {
		const event = makeEvent('POST', { title: 'Test Case' });
		const res = await POST(event);
		expect(res.status).toBe(400);
	});

	it('creates case with valid input', async () => {
		const event = makeEvent('POST', {
			title: 'New Case v2',
			description: 'Full description of the case',
			priority: 'high',
		});
		const res = await POST(event);
		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.success).toBe(true);
		expect(body.data.case).toBeDefined();
	});

	it('accepts optional status and priority', async () => {
		const event = makeEvent('POST', {
			title: 'Urgent Case',
			description: 'Needs attention',
			status: 'in_progress',
			priority: 'urgent',
		});
		const res = await POST(event);
		expect(res.status).toBe(201);
	});

	it('rejects invalid status value', async () => {
		const event = makeEvent('POST', {
			title: 'Bad Status',
			description: 'Testing',
			status: 'invalid_status',
		});
		const res = await POST(event);
		expect(res.status).toBe(400);
	});
});

// ════════════════════════════════════════════════════════════════
//  /api/cases (PATCH — bulk update)
// ════════════════════════════════════════════════════════════════
describe('PATCH /api/cases', () => {
	let PATCH: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/cases/+server.ts');
		PATCH = mod.PATCH;
	});

	it('rejects unauthenticated requests', async () => {
		const event = makeEvent('PATCH', { ids: ['123'], status: 'closed' }, { user: null });
		event.locals.user = undefined;
		const res = await PATCH(event);
		expect(res.status).toBe(401);
	});

	it('rejects empty ids array', async () => {
		const event = makeEvent('PATCH', { ids: [] });
		const res = await PATCH(event);
		expect(res.status).toBe(400);
	});

	it('rejects non-UUID ids', async () => {
		const event = makeEvent('PATCH', { ids: ['not-a-uuid'], status: 'closed' });
		const res = await PATCH(event);
		expect(res.status).toBe(400);
	});

	it('updates cases with valid input', async () => {
		const event = makeEvent('PATCH', {
			ids: ['550e8400-e29b-41d4-a716-446655440000'],
			status: 'closed',
		});
		const res = await PATCH(event);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.success).toBe(true);
	});
});

// ════════════════════════════════════════════════════════════════
//  /api/evidence (GET)
// ════════════════════════════════════════════════════════════════
describe('GET /api/evidence', () => {
	let GET: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/evidence/+server.ts');
		GET = mod.GET;
	});

	it('rejects unauthenticated requests', async () => {
		const event = makeEvent('GET', undefined, { user: null });
		event.locals.user = undefined;
		const res = await GET(event);
		expect(res.status).toBe(401);
	});

	it('returns evidence list with default params', async () => {
		const event = makeEvent('GET', undefined, {
			searchParams: new URLSearchParams({ page: '1', limit: '20' }),
		});
		const res = await GET(event);
		// Route may return 200 or fallback to catch block (200 with empty evidence)
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.evidence).toBeDefined();
	});

	it('filters by caseId', async () => {
		const event = makeEvent('GET', undefined, {
			searchParams: new URLSearchParams({ page: '1', limit: '20', caseId: 'case-123' }),
		});
		const res = await GET(event);
		expect(res.status).toBe(200);
	});

	it('filters by search term', async () => {
		const event = makeEvent('GET', undefined, {
			searchParams: new URLSearchParams({ page: '1', limit: '20', search: 'fingerprint' }),
		});
		const res = await GET(event);
		expect(res.status).toBe(200);
	});

	it('respects custom pagination params', async () => {
		const event = makeEvent('GET', undefined, {
			searchParams: new URLSearchParams({ page: '2', limit: '5' }),
		});
		const res = await GET(event);
		expect(res.status).toBe(200);
	});
});
