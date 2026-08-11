import { describe, expect, it } from 'vitest';
import { GET } from './+server.js';

describe('GET /api/admin/atlas/pass-fabric/boundary', () => {
	it('rejects unauthenticated requests', async () => {
		const response = await GET({ locals: {} } as never);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: 'Unauthorized' });
	});

	it('returns the boundary receipt when authenticated', async () => {
		const response = await GET({ locals: { user: { id: 'tester' } } } as never);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.appendOnlyHistoryTable).toBe('analysis_pass_results');
		expect(body.currentMaterializationView).toBe('analysis_pass_current');
		expect(body.reuseBoundary).toBe('application_level_reuse');
	});
});
