// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
	rrfFuse,
	rrfFuseDenseSparse,
	type RrfHit,
	type RrfSource,
} from '$lib/server/retrieval/rrf-fuse.js';

const h = (id: string, score = 0): RrfHit => ({ id, score });

describe('rrfFuse', () => {
	it('returns empty for zero sources', () => {
		expect(rrfFuse([])).toEqual([]);
	});

	it('returns empty for sources with empty hit lists', () => {
		expect(rrfFuse([{ hits: [] }, { hits: [] }])).toEqual([]);
	});

	it('preserves single-source order at default k=60', () => {
		const hits = [h('a'), h('b'), h('c')];
		const fused = rrfFuse([{ hits }]);
		expect(fused.map((r) => r.id)).toEqual(['a', 'b', 'c']);
	});

	it('combines two sources with shared id (boost)', () => {
		// 'b' appears in both lists; 'a' only in source A.
		// Expected: 'b' wins because it accumulates two contributions.
		const fused = rrfFuse([
			{ hits: [h('a'), h('b'), h('c')] },
			{ hits: [h('b'), h('c')] },
		]);
		expect(fused[0].id).toBe('b');
	});

	it('respects source weights — higher weight ranks earlier', () => {
		// 'x' is only in source A, 'y' only in source B
		// Both at rank 1, but B has 2× weight → y wins
		const fused = rrfFuse([
			{ hits: [h('x')], weight: 1.0, label: 'a' },
			{ hits: [h('y')], weight: 2.0, label: 'b' },
		]);
		expect(fused[0].id).toBe('y');
	});

	it('skips sources with weight 0', () => {
		const fused = rrfFuse([
			{ hits: [h('x')], weight: 0 },
			{ hits: [h('y')], weight: 1 },
		]);
		expect(fused.map((r) => r.id)).toEqual(['y']);
	});

	it('honors topK truncation', () => {
		const hits = Array.from({ length: 20 }, (_, i) => h(`d${i}`));
		const fused = rrfFuse([{ hits }], { topK: 5 });
		expect(fused).toHaveLength(5);
	});

	it('throws on k <= 0', () => {
		expect(() => rrfFuse([{ hits: [h('a')] }], { k: 0 })).toThrow();
		expect(() => rrfFuse([{ hits: [h('a')] }], { k: -1 })).toThrow();
	});

	it('produces deterministic order for tied scores (id asc tiebreak)', () => {
		// Two sources, no overlap, both rank 1 — tied scores
		const fused = rrfFuse([
			{ hits: [h('zebra')] },
			{ hits: [h('apple')] },
		]);
		// Same rrfScore → tiebreak on id ascending
		expect(fused[0].rrfScore).toBe(fused[1].rrfScore);
		expect(fused.map((r) => r.id)).toEqual(['apple', 'zebra']);
	});

	it('passes through payload from first source containing the id', () => {
		const fused = rrfFuse([
			{ hits: [{ id: 'x', payload: { from: 'dense' } }] },
			{ hits: [{ id: 'x', payload: { from: 'sparse' } }] },
		]);
		expect(fused[0].payload).toEqual({ from: 'dense' });
	});

	it('includes provenance when requested', () => {
		const fused = rrfFuse(
			[
				{ hits: [h('a'), h('b')], label: 'dense' },
				{ hits: [h('b'), h('a')], label: 'sparse' },
			],
			{ includeProvenance: true }
		);
		expect(fused[0].provenance).toBeDefined();
		expect(Object.keys(fused[0].provenance!)).toEqual(['dense', 'sparse']);
		expect(fused[0].provenance!.dense.rank).toBeGreaterThan(0);
	});

	it('omits provenance by default', () => {
		const fused = rrfFuse([{ hits: [h('a')] }]);
		expect(fused[0].provenance).toBeUndefined();
	});

	it('higher k flattens the score distribution', () => {
		// Score difference between rank 1 and rank 2 should be smaller at k=120 than at k=10
		const hits = [h('a'), h('b')];
		const tight  = rrfFuse([{ hits }], { k: 10  });
		const loose  = rrfFuse([{ hits }], { k: 120 });
		const tightDelta = tight[0].rrfScore - tight[1].rrfScore;
		const looseDelta = loose[0].rrfScore - loose[1].rrfScore;
		expect(looseDelta).toBeLessThan(tightDelta);
	});
});

describe('rrfFuseDenseSparse', () => {
	it('uses 0.6 / 0.4 default weights (dense favored)', () => {
		// Both 'a' and 'b' are unique to one source; both at rank 1.
		// Dense weight 0.6 > sparse weight 0.4 → dense wins.
		const fused = rrfFuseDenseSparse([h('dense_only')], [h('sparse_only')]);
		expect(fused[0].id).toBe('dense_only');
		expect(fused[1].id).toBe('sparse_only');
	});

	it('always emits provenance (so callers can debug fusion)', () => {
		const fused = rrfFuseDenseSparse([h('x')], [h('x')]);
		expect(fused[0].provenance).toBeDefined();
		expect(fused[0].provenance!.dense).toBeDefined();
		expect(fused[0].provenance!.sparse).toBeDefined();
	});

	it('lets caller override weights (sparse-favored for cite-heavy queries)', () => {
		const fused = rrfFuseDenseSparse(
			[h('dense_only')],
			[h('sparse_only')],
			{ denseWeight: 0.3, sparseWeight: 0.7 }
		);
		expect(fused[0].id).toBe('sparse_only');
	});

	it('handles empty dense lane (sparse-only fallback)', () => {
		const fused = rrfFuseDenseSparse([], [h('s1'), h('s2')]);
		expect(fused.map((r) => r.id)).toEqual(['s1', 's2']);
	});

	it('handles empty sparse lane (dense-only fallback)', () => {
		const fused = rrfFuseDenseSparse([h('d1'), h('d2')], []);
		expect(fused.map((r) => r.id)).toEqual(['d1', 'd2']);
	});
});
