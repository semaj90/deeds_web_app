import { describe, expect, it } from 'vitest';

import { aggregateParentAtlasTournamentReceiptsV1 } from './parent-atlas-tournament-receipt-aggregator-v1.js';

describe('aggregateParentAtlasTournamentReceiptsV1', () => {
	it('fails closed for gates with no accepted evidence', () => {
		const snapshot = aggregateParentAtlasTournamentReceiptsV1([]);
		expect(snapshot.progress.proofProgressPct).toBe(0);
		expect(snapshot.gates.every((gate) => gate.state === 'UNPROVEN')).toBe(true);
	});

	it('keeps execution efficiency separate from proof state', () => {
		const snapshot = aggregateParentAtlasTournamentReceiptsV1([], {
			inputTokens: 100,
			outputTokens: 100,
			baselineInputTokens: 1000,
			baselineOutputTokens: 1000,
			kvCacheReadTokens: 900,
			kvCacheWriteTokens: 100
		});
		expect(snapshot.progress.proofProgressPct).toBe(0);
		expect(snapshot.progress.efficiency.tokenSavingsPct).toBe(90);
		expect(snapshot.progress.efficiency.kvReusePct).toBe(90);
	});
});
