import { describe, it, expect } from 'vitest';
import { recallAtK, reciprocalRank, summarizeLane, type JudgedQueryV1 } from './recommendation-metrics-v1.js';

const q = (relevant: string[], ranked: string[]): JudgedQueryV1 => ({ queryId: 'q', relevant, ranked });

describe('recallAtK', () => {
	it('counts relevant items in the top K over the relevant set size', () => {
		expect(recallAtK(q(['a', 'b'], ['a', 'x', 'b']), 2)).toBe(0.5);
		expect(recallAtK(q(['a', 'b'], ['a', 'x', 'b']), 3)).toBe(1);
	});

	it('returns 0 when no judged items exist', () => {
		expect(recallAtK(q([], ['a']), 5)).toBe(0);
	});

	it('rejects a non-positive or fractional K', () => {
		expect(() => recallAtK(q(['a'], ['a']), 0)).toThrow('METRIC_K_INVALID');
		expect(() => recallAtK(q(['a'], ['a']), 1.5)).toThrow('METRIC_K_INVALID');
	});
});

describe('reciprocalRank', () => {
	it('is 1/rank of the first relevant item, or 0 when absent', () => {
		expect(reciprocalRank(q(['c'], ['a', 'b', 'c']))).toBeCloseTo(1 / 3, 9);
		expect(reciprocalRank(q(['z'], ['a', 'b']))).toBe(0);
	});
});

describe('summarizeLane', () => {
	it('averages recall and MRR across judged queries', () => {
		const s = summarizeLane(
			'lexical',
			[q(['a'], ['a', 'b']), q(['c'], ['x', 'c'])],
			1
		);
		expect(s.meanRecallAtK).toBe(0.5);
		expect(s.mrr).toBeCloseTo((1 + 0.5) / 2, 9);
		expect(s.queries).toBe(2);
	});

	it('fails closed on an empty query set', () => {
		expect(() => summarizeLane('semantic', [], 5)).toThrow('METRIC_NO_QUERIES');
	});
});
