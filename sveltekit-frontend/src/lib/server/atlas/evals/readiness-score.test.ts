import { describe, expect, it } from 'vitest';

import { parentAtlasReadinessTemplate, scoreReadiness } from './readiness-score.js';

describe('scoreReadiness', () => {
	it('returns a weighted 0-100 score without counting plans as complete', () => {
		const result = scoreReadiness([
			{ id: 'a', label: 'A', weight: 10, status: 'proven' },
			{ id: 'b', label: 'B', weight: 10, status: 'partial' },
			{ id: 'c', label: 'C', weight: 10, status: 'blocked' },
			{ id: 'd', label: 'D', weight: 10, status: 'not_started' },
		]);

		expect(result.percent).toBe(37.5);
		expect(result.weightedEarned).toBe(15);
		expect(result.weightedPossible).toBe(40);
		expect(result.counts).toEqual({ proven: 1, partial: 1, blocked: 1, not_started: 1 });
	});

	it('provides a 100-point alignment template', () => {
		const gates = parentAtlasReadinessTemplate();
		expect(gates.reduce((sum, gate) => sum + gate.weight, 0)).toBe(100);
		expect(new Set(gates.map((gate) => gate.id)).size).toBe(gates.length);
		expect(scoreReadiness(gates).percent).toBe(0);
	});

	it('rejects invalid weights', () => {
		expect(() => scoreReadiness([
			{ id: 'bad', label: 'Bad', weight: 0, status: 'proven' },
		])).toThrow('invalid gate weight');
	});
});
