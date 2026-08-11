import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../lib/server/analysis/analysis-pass-results.js', () => ({
	buildAnalysisPassLedgerProofSnapshot: vi.fn(async () => ({
		generatedAt: '2026-08-11T00:00:00.000Z',
		totalRows: 11076,
		duplicateGroupCount: 1272,
		classificationCounts: {
			identical_retry: 0,
			stochastic_history: 1272,
			revision_mixed: 0,
			ambiguous: 0,
		},
		duplicateGroups: [
			{
				passKey: 'analysis-pass:demo',
				packetKey: 'packet-1',
				passType: 'summarization',
				inputHash: 'hash-1',
				copies: 5,
				firstSeen: '2026-08-10T00:00:00.000Z',
				lastSeen: '2026-08-11T00:00:00.000Z',
				outputVersions: 5,
				provenanceVersions: 1,
				sourceRevisionVersions: 1,
				passRevisionVersions: 1,
				classification: 'stochastic_history',
				classificationReason: 'multiple output versions observed for the same logical duplicate group',
			},
		],
	})),
}));

import { GET } from './+server.js';

describe('GET /api/admin/atlas/pass-fabric/live', () => {
	it('rejects unauthenticated requests', async () => {
		const response = await GET({ locals: {} } as never);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: 'Unauthorized' });
	});

	it('returns the live PF4A snapshot when authenticated', async () => {
		const response = await GET({ locals: { user: { id: 'tester' } } } as never);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.status).toBe('available');
		expect(body.totalRows).toBe(11076);
		expect(body.duplicateGroupCount).toBe(1272);
		expect(body.classificationCounts.stochastic_history).toBe(1272);
		expect(body.duplicateGroups[0].classification).toBe('stochastic_history');
	});
});
