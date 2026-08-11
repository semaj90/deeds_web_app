import { describe, expect, it } from 'vitest';
import { GET } from './proof/+server.js';

describe('GET /api/admin/atlas/retrieval/proof', () => {
	it('rejects unauthenticated requests', async () => {
		const response = await GET({ locals: {} } as never);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: 'Unauthorized' });
	});

	it('returns the RRF one-vote-per-lane proof snapshot when authenticated', async () => {
		const response = await GET({ locals: { user: { id: 'tester' } } } as never);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.summary.oneVotePerLane).toBe(true);
		expect(body.receipts[0].proof_gate).toBe('RRF_ONE_VOTE_PER_LANE_WIRED');
		expect(body.receipts[0].canonical_identity_field).toBe('packet_key');
	});
});
