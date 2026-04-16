/**
 * Shared helpers for Vitest unit tests of SvelteKit route handlers (+server.ts / +page.server.ts).
 *
 * Pattern enforced across the repo:
 *   1. vi.mock() all module-scope dependencies BEFORE any import
 *   2. lazy-import the route handler inside each it() block
 *   3. build a minimal RequestEvent via makeEvent() / makeRequest()
 *   4. cover 4 baseline cases: 401 unauth, 400 bad input, 200 success, degraded upstream
 *
 * @see tests/routes/all-routes-page-server.test.ts for a full worked example
 */

import { vi } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Request / Event factories
// ─────────────────────────────────────────────────────────────────────────────

export interface MakeEventOptions {
	method?: string;
	url?: string | URL;
	body?: unknown;
	params?: Record<string, string>;
	locals?: Record<string, unknown>;
	headers?: Record<string, string>;
	/** Per-request fetch mock (use vi.fn()). Overrides global fetch stub. */
	fetch?: ReturnType<typeof vi.fn>;
}

/**
 * Build a minimal SvelteKit RequestEvent for testing route handlers.
 *
 * @example
 * const event = makeEvent({ locals: { user: { id: 'u1' } }, url: '/api/cases?q=fraud' });
 * const res = await GET(event as any);
 * expect(res.status).toBe(200);
 */
export function makeEvent(opts: MakeEventOptions = {}): Record<string, unknown> {
	const urlStr =
		opts.url instanceof URL
			? opts.url.toString()
			: opts.url?.startsWith('http')
				? opts.url
				: `http://localhost${opts.url ?? '/'}`;

	const url = new URL(urlStr);

	const headers = new Headers(opts.headers ?? {});
	if (opts.body !== undefined && !headers.has('content-type')) {
		headers.set('content-type', 'application/json');
	}

	const request = new Request(url, {
		method: opts.method ?? 'GET',
		headers,
		body:
			opts.body !== undefined && opts.method !== 'GET'
				? JSON.stringify(opts.body)
				: undefined,
	});

	return {
		url,
		request,
		params: opts.params ?? {},
		locals: opts.locals ?? {},
		fetch: opts.fetch ?? vi.fn(),
		platform: {},
		cookies: {
			get: vi.fn(),
			getAll: vi.fn(() => []),
			set: vi.fn(),
			delete: vi.fn(),
			serialize: vi.fn(),
		},
		setHeaders: vi.fn(),
		isDataRequest: false,
		route: { id: null },
	};
}

/**
 * Build an authenticated event (locals.user populated).
 *
 * @example
 * const event = makeAuthEvent({ url: '/api/cases' });
 */
export function makeAuthEvent(
	opts: MakeEventOptions & { userId?: string; role?: string } = {}
): Record<string, unknown> {
	return makeEvent({
		...opts,
		locals: {
			user: { id: opts.userId ?? 'test-user-id', role: opts.role ?? 'admin' },
			...opts.locals,
		},
	});
}

/**
 * Build a POST event with a JSON body.
 *
 * @example
 * const event = makePostEvent({ body: { title: 'Case A' }, locals: { user: { id: 'u1' } } });
 * const res = await POST(event as any);
 */
export function makePostEvent(
	opts: Omit<MakeEventOptions, 'method'> & { body: unknown }
): Record<string, unknown> {
	return makeEvent({ ...opts, method: 'POST' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Response helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Parse a Response body as JSON, asserting the parse succeeds. */
export async function responseJson<T = unknown>(res: Response): Promise<T> {
	const text = await res.text();
	try {
		return JSON.parse(text) as T;
	} catch {
		throw new Error(`Response body is not JSON:\n${text}`);
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Standard env mock (call inside vi.mock() at top of test file)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the standard env.server mock factory.
 * Use as the second argument to vi.mock('$lib/config/env.server.js', envMockFactory).
 *
 * @example
 * vi.mock('$lib/config/env.server.js', envMockFactory());
 */
export function envMockFactory(
	overrides: Record<string, () => string | number | boolean> = {}
) {
	return () => ({
		getQdrantUrl: () => 'http://qdrant.test:6333',
		getOllamaUrl: () => 'http://ollama.test:11434',
		getRedisUrl: () => 'redis://redis.test:6379',
		getNeo4jUrl: () => 'bolt://neo4j.test:7687',
		getPostgresUrl: () => 'postgresql://test:test@postgres.test/testdb',
		getCouchdbUrl: () => 'http://couchdb.test:5984',
		getMinioEndpoint: () => 'minio.test',
		getRabbitMQUrl: () => 'amqp://guest:guest@rabbitmq.test:5672',
		...overrides,
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch stub helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a vi.fn() that returns a successful JSON Response.
 *
 * @example
 * const fetchMock = jsonFetchMock({ items: [], total: 0 });
 * vi.stubGlobal('fetch', fetchMock);
 */
export function jsonFetchMock(body: unknown, status = 200): ReturnType<typeof vi.fn> {
	return vi.fn(async () =>
		new Response(JSON.stringify(body), {
			status,
			headers: { 'Content-Type': 'application/json' },
		})
	);
}

/**
 * Creates a vi.fn() that mimics an Ollama-style SSE/streaming response for the embedding endpoint.
 */
export function ollamaEmbedMock(embedding: number[] = new Array(768).fill(0)): ReturnType<typeof vi.fn> {
	return vi.fn(async () =>
		new Response(JSON.stringify({ embedding }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		})
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// Assertion helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assert that a Response has a specific status and that the body matches
 * a partial object shape (using expect().toMatchObject).
 *
 * @example
 * await assertJsonResponse(res, 200, { ok: true, items: [] });
 */
export async function assertJsonResponse(
	res: Response,
	expectedStatus: number,
	expectedBody?: unknown
): Promise<void> {
	const { expect } = await import('vitest');
	expect(res.status).toBe(expectedStatus);
	if (expectedBody !== undefined) {
		const body = await responseJson(res);
		expect(body).toMatchObject(expectedBody as Record<string, unknown>);
	}
}
