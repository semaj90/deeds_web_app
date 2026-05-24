// @vitest-environment node
/**
 * Unit tests for GET /api/ai/models
 *
 * Covers:
 *  - 401 when user is not authenticated
 *  - 200 with model list when Ollama responds
 *  - 200 with { models: [] } (NOT 503) when Ollama returns non-OK
 *  - 200 with { models: [] } (NOT 503) when fetch throws (ECONNREFUSED)
 *  - ETag / 304 Not Modified path
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

const { mockFetch, mockCacheControl, mockCheckETag, mockNotModified } = vi.hoisted(() => ({
	mockFetch: vi.fn(),
	mockCacheControl: { short: {}, medium: { 'Cache-Control': 'public, max-age=60' } },
	mockCheckETag: vi.fn(),
	mockNotModified: vi.fn(),
}));

vi.mock('$lib/server/env.server.js', () => ({
	ENV: { OLLAMA_BASE_URL: 'http://localhost:11434' },
}));

vi.mock('$lib/server/middleware/cache-headers.js', () => ({
	cacheControl: mockCacheControl,
	checkETag: (...args: unknown[]) => mockCheckETag(...args),
	notModified: (...args: unknown[]) => mockNotModified(...args),
}));

// ── helpers ───────────────────────────────────────────────────────────────────

function makeEvent(userId?: string, headers: Record<string, string> = {}) {
	return {
		locals: { user: userId ? { id: userId } : undefined },
		request: { headers: { get: (k: string) => headers[k] ?? null } },
	};
}

function ollamaResponse(models: unknown[]) {
	return { ok: true, json: async () => ({ models }) };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/ai/models', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Default: ETag doesn't match → full response
		mockCheckETag.mockReturnValue({ etag: '"abc123"', isMatch: false });
	});

	it('returns 401 when user is not authenticated', async () => {
		const { GET } = await import('../../src/routes/api/ai/models/+server.js');
		const res = await GET(makeEvent() as any);

		expect(res.status).toBe(401);
	});

	it('returns 200 with model list when Ollama responds OK', async () => {
		const models = [
			{ name: 'gemma4-rotorquant:latest', size: '5000000000', modified_at: '2026-01-01', digest: 'abc123def456' },
			{ name: 'embeddinggemma:latest', size: '1000000000', modified_at: '2026-01-01', digest: 'def456abc789' },
		];
		global.fetch = vi.fn().mockResolvedValueOnce(ollamaResponse(models)) as any;

		const { GET } = await import('../../src/routes/api/ai/models/+server.js');
		const res = await GET(makeEvent('user-1') as any);
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.models).toHaveLength(2);
		expect(body.models[0].name).toBe('gemma4-rotorquant:latest');
		expect(body.models[0].digest).toHaveLength(12); // sliced to 12
	});

	it('returns 200 with empty models (not 503) when Ollama returns non-OK', async () => {
		global.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 503 }) as any;

		const { GET } = await import('../../src/routes/api/ai/models/+server.js');
		const res = await GET(makeEvent('user-1') as any);
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.models).toEqual([]);
		expect(body.error).toBeUndefined(); // no error key leaked
	});

	it('returns 200 with empty models (not 503) when fetch throws', async () => {
		global.fetch = vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED')) as any;

		const { GET } = await import('../../src/routes/api/ai/models/+server.js');
		const res = await GET(makeEvent('user-1') as any);
		const body = await res.json();

		expect(res.status).toBe(200);
		expect(body.models).toEqual([]);
		expect(body.error).toBeUndefined();
	});

	it('returns 304 Not Modified when ETag matches', async () => {
		global.fetch = vi.fn().mockResolvedValueOnce(ollamaResponse([{ name: 'gemma4-rotorquant:latest', size: '5GB', modified_at: '2026-01-01', digest: 'abc123def456' }])) as any;
		mockCheckETag.mockReturnValue({ etag: '"abc123"', isMatch: true });
		mockNotModified.mockReturnValue(new Response(null, { status: 304 }));

		const { GET } = await import('../../src/routes/api/ai/models/+server.js');
		const res = await GET(makeEvent('user-1') as any);

		expect(res.status).toBe(304);
		expect(mockNotModified).toHaveBeenCalledOnce();
	});
});
