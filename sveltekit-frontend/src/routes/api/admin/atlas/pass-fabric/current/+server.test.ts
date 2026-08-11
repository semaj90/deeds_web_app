import { describe, expect, it } from 'vitest';
import { GET } from './+server.js';

describe('GET /api/admin/atlas/pass-fabric/current', () => {
	it('rejects unauthenticated requests', async () => {
		const response = await GET({ locals: {} } as never);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: 'Unauthorized' });
	});

	it('returns a current-materialization snapshot when authenticated', async () => {
		const response = await GET({ locals: { user: { id: 'tester' } } } as never);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.canonicalRepresentationId).toBe('semantic_768');
		expect(body.canonicalDimension).toBe(768);
		expect(body.rawRows).toBeGreaterThanOrEqual(body.currentRows);
	});
});
