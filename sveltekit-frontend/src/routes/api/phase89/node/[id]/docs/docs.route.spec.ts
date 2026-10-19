import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sql, embed } = vi.hoisted(() => ({ sql: vi.fn(), embed: vi.fn() }));
vi.mock('postgres', () => ({ default: () => sql }));
vi.mock('$lib/server/env.server.js', () => ({
	ENV: { DATABASE_URL: 'postgres://test', QDRANT_URL: 'http://qdrant.test', OLLAMA_BASE_URL: 'http://ollama.test' },
}));
vi.mock('$lib/server/ollama.js', () => ({ embedOrChatFetch: embed }));

import { GET } from './+server.js';

const event = (id: string, user: unknown = { id: 'u' }) => ({ params: { id }, locals: { user } }) as never;

describe('GET /api/phase89/node/[id]/docs', () => {
	beforeEach(() => {
		sql.mockReset();
		embed.mockReset();
		embed.mockResolvedValue({ json: async () => ({ embedding: [0.1, 0.2] }) });
		vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ result: { points: [{ score: 0.9, payload: { title: 'Doc', text: 'body' } }] } }) })));
	});
	afterEach(() => vi.unstubAllGlobals());

	it('requires a signed-in user and an integer id', async () => {
		expect((await GET(event('1', null))).status).toBe(401);
		for (const id of ['abc', '0', '-2', '1.5', '550e8400-e29b-41d4-a716-446655440000']) {
			expect((await GET(event(id))).status).toBe(400);
		}
		expect(sql).not.toHaveBeenCalled();
	});

	it('selects the real kg_nodes columns and builds the error query from properties', async () => {
		sql.mockResolvedValue([{ id: 5, kind: 'error', label: 'x', meta: { code: 'TS2345', message: 'bad arg' } }]);
		const response = await GET(event('5'));
		const body = await response.json();
		expect(response.status).toBe(200);
		expect(body.query).toBe('Fix TypeScript error TS2345: bad arg');
		expect(body.results).toEqual([{ title: 'Doc', snippet: 'body', score: 0.9, tags: [] }]);
		const query = (sql.mock.calls[0]?.[0] as string[]).join('?');
		expect(query).toContain('node_type AS kind');
		expect(query).toContain('properties AS meta');
		expect(query).not.toMatch(/SELECT id, kind/);
		expect(query).not.toContain('embedding');
		expect(sql.mock.calls[0]?.[1]).toBe(5);
	});

	it('returns 404 for a missing node and an empty result on failure', async () => {
		sql.mockResolvedValue([]);
		expect((await GET(event('9'))).status).toBe(404);
		sql.mockRejectedValue(new Error('database unavailable'));
		const failed = await GET(event('9'));
		expect(failed.status).toBe(200);
		expect(await failed.json()).toEqual({ results: [], query: '' });
	});
});
