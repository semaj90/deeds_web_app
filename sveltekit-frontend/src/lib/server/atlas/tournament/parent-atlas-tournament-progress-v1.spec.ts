import { describe, expect, it } from 'vitest';

import { calculateTournamentProgressV1, type TournamentGateV1 } from './parent-atlas-tournament-progress-v1.js';

const gates: TournamentGateV1[] = [
	{ id: 'source_identity', phase: '01 Identity', label: 'identity', weight: 4, state: 'PROVEN' },
	{ id: 'treesitter_ast', phase: '02 Structural', label: 'tree-sitter', weight: 2, state: 'WIRED' },
	{ id: 'held_out_tournament', phase: '08 Agentic', label: 'held out', weight: 4, state: 'BLOCKED' }
];

describe('calculateTournamentProgressV1', () => {
	it('keeps efficiency telemetry outside proof progress', () => {
		const baseline = calculateTournamentProgressV1(gates);
		const optimized = calculateTournamentProgressV1(gates, {
			inputTokens: 100,
			outputTokens: 50,
			baselineInputTokens: 1_000,
			baselineOutputTokens: 500,
			kvCacheReadTokens: 900,
			kvCacheWriteTokens: 100,
			valkeyHits: 9,
			valkeyMisses: 1,
			filesEdited: 1,
			filesReused: 9
		});

		expect(optimized.proofProgressPct).toBe(baseline.proofProgressPct);
		expect(optimized.proofProgressPct).toBe(50);
		expect(optimized.efficiency.tokenSavingsPct).toBe(90);
		expect(optimized.efficiency.kvReusePct).toBe(90);
		expect(optimized.efficiency.cacheHitPct).toBe(90);
		expect(optimized.efficiency.filesReusePct).toBe(90);
	});

	it('uses measured PARTIAL completion instead of a fabricated pass', () => {
		const result = calculateTournamentProgressV1([
			{ id: 'semantic_768', phase: '03 Representations', label: 'semantic', weight: 10, state: 'PARTIAL', completion: 0.15 }
		]);

		expect(result.proofProgressPct).toBe(15);
		expect(result.currentGate).toBe('semantic_768');
	});
});
