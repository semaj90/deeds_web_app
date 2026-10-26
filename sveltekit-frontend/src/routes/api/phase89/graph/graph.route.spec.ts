import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sql, readFile } = vi.hoisted(() => ({ sql: vi.fn(), readFile: vi.fn() }));
vi.mock('postgres', () => ({ default: () => sql }));
vi.mock('fs/promises', () => ({ default: { readFile } }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { DATABASE_URL: 'postgres://test' } }));

import { GET } from './+server.js';

const text = (call: unknown[]) => (call[0] as string[]).join('?');

describe('GET /api/phase89/graph', () => {
	beforeEach(() => {
		sql.mockReset();
		readFile.mockReset();
		readFile.mockRejectedValue(new Error('no cached export'));
	});

	it('reads kg_nodes through its real columns and keeps the kind/meta response keys', async () => {
		sql.mockResolvedValue([{ id: 3, kind: 'error', label: 'TS2345', meta: { code: 'TS2345' } }]);
		const response = await GET({ url: new URL('http://x/api/phase89/graph'), locals: { user: { id: 'u' } } } as never);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({ nodes: [{ id: 3, kind: 'error', label: 'TS2345', meta: { code: 'TS2345' } }], edges: [] });
		expect(sql).toHaveBeenCalledTimes(1);
		const query = text(sql.mock.calls[0] as unknown[]);
		expect(query).toContain('node_type AS kind');
		expect(query).toContain('properties AS meta');
		expect(query).not.toContain('kg_edges');
		expect(query).not.toMatch(/SELECT id, kind/);
	});

	it('serves the cached export unchanged without touching the database', async () => {
		readFile.mockResolvedValue(JSON.stringify({ nodes: [{ id: 1 }], edges: [] }));
		const response = await GET({ url: new URL('http://x/'), locals: { user: { id: 'u' } } } as never);
		expect(await response.json()).toEqual({ nodes: [{ id: 1 }], edges: [] });
		expect(sql).not.toHaveBeenCalled();
	});

	it('returns the same keys on unauthorized and on database failure', async () => {
		const unauthorized = await GET({ url: new URL('http://x/'), locals: { user: null } } as never);
		expect(unauthorized.status).toBe(401);

		sql.mockRejectedValue(new Error('database unavailable'));
		const failed = await GET({ url: new URL('http://x/'), locals: { user: { id: 'u' } } } as never);
		expect(failed.status).toBe(200);
		expect(await failed.json()).toEqual({ nodes: [], edges: [] });
	});
});
