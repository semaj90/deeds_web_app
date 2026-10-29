import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ resolve: vi.fn() }));

vi.mock('$lib/server/env.server.js', () => ({ ENV: { DATABASE_URL: undefined } }));
vi.mock('$lib/server/tools/schema-dependents', async () => {
	const { z } = await import('zod');
	return {
		findSchemaDependents: mocks.resolve,
		FindSchemaDependentsInputSchema: z.object({ table: z.string().min(1), includeAce: z.boolean().optional() }),
	};
});

import { GET, POST } from './+server.js';

describe('/api/atlas/schema-dependents database configuration', () => {
	beforeEach(() => vi.clearAllMocks());

	it('returns a stable 503 GET shape without attempting a database query', async () => {
		const response = await GET({
			locals: { user: { id: 'user-1' } },
			url: new URL('http://localhost/api/atlas/schema-dependents?table=documents'),
		} as never);
		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({
			error: 'Database is not configured',
			table: 'documents',
			dependents: [],
			summary: { total: 0, reads: 0, writes: 0, deletes: 0, high_risk_count: 0 },
			ace_context: false,
			migration_risk: 'unknown',
		});
		expect(mocks.resolve).not.toHaveBeenCalled();
	});

	it('keeps the same GET error keys for unauthorized and invalid-query responses', async () => {
		const unauthorized = await GET({ locals: {}, url: new URL('http://localhost/api/atlas/schema-dependents') } as never);
		const invalid = await GET({ locals: { user: { id: 'user-1' } }, url: new URL('http://localhost/api/atlas/schema-dependents') } as never);
		expect(unauthorized.status).toBe(401);
		expect(invalid.status).toBe(400);
		const unauthorizedBody = await unauthorized.json();
		const invalidBody = await invalid.json();
		expect(Object.keys(unauthorizedBody).sort()).toEqual(Object.keys(invalidBody).sort());
		expect(unauthorizedBody.dependents).toEqual([]);
		expect(invalidBody.dependents).toEqual([]);
	});

	it('validates POST bodies before returning the missing-database status', async () => {
		const malformed = await POST({
			locals: { user: { id: 'user-1' } },
			request: new Request('http://localhost/api/atlas/schema-dependents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ table: 4 }) }),
		} as never);
		expect(malformed.status).toBe(400);

		const valid = await POST({
			locals: { user: { id: 'user-1' } },
			request: new Request('http://localhost/api/atlas/schema-dependents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ table: 'documents' }) }),
		} as never);
		expect(valid.status).toBe(503);
		expect(await valid.json()).toMatchObject({ error: 'Database is not configured', dependents: [], migration_risk: 'unknown' });
		expect(mocks.resolve).not.toHaveBeenCalled();
	});
});
