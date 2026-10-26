import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sql } = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock('postgres', () => ({ default: () => sql }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { DATABASE_URL: 'postgres://test' } }));

import { GET } from './+server.js';

const event = (id: string, user: unknown = { id: 'u' }) => ({ params: { id }, locals: { user } }) as never;

describe('GET /api/phase89/node/[id]/similar', () => {
	beforeEach(() => sql.mockReset());

	it('requires a signed-in user', async () => {
		expect((await GET(event('1', null))).status).toBe(401);
	});

	it.each(['abc', '0', '-1', '1.5', '', '99999999999', '3e2', '0x10', '550e8400-e29b-41d4-a716-446655440000'])(
		'rejects %j as an invalid integer id without querying',
		async (id) => {
			const response = await GET(event(id));
			expect(response.status).toBe(400);
			expect(sql).not.toHaveBeenCalled();
		},
	);

	it('looks the node up by integer id using the real kg_nodes columns', async () => {
		sql.mockResolvedValue([{ id: 7, kind: 'error', label: 'TS2345' }]);
		const response = await GET(event('7'));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ error: 'Node has no embedding', results: [] });
		const query = (sql.mock.calls[0]?.[0] as string[]).join('?');
		expect(query).toContain('node_type AS kind');
		expect(query).not.toContain('embedding FROM');
		expect(sql.mock.calls[0]?.[1]).toBe(7);
		expect(sql).toHaveBeenCalledTimes(1);
	});

	it('returns 404 for a missing node and a stable empty result on database failure', async () => {
		sql.mockResolvedValue([]);
		expect((await GET(event('8'))).status).toBe(404);
		sql.mockRejectedValue(new Error('database unavailable'));
		const failed = await GET(event('8'));
		expect(failed.status).toBe(200);
		expect(await failed.json()).toEqual({ results: [] });
	});
});
