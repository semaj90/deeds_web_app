import { describe, expect, it } from 'vitest';
import {
	filterCandidateSetOverlapV1,
	type CandidateItemV1,
} from './candidate-set-overlap-filter-v1.js';

describe('CANDIDATE-SET-OVERLAP-FILTER-01', () => {
	const setA: CandidateItemV1[] = [
		{ candidateId: 'cand:1', ordinal: 0, score: 0.95, sourceRef: 'src/lib/a.ts' },
		{ candidateId: 'cand:2', ordinal: 1, score: 0.88, sourceRef: 'src/lib/b.ts' },
		{ candidateId: 'cand:3', ordinal: 2, score: 0.72, sourceRef: 'src/lib/c.ts' },
	];

	const setB: CandidateItemV1[] = [
		{ candidateId: 'cand:2', ordinal: 10, score: 0.89, sourceRef: 'src/lib/b.ts' },
		{ candidateId: 'cand:4', ordinal: 11, score: 0.65, sourceRef: 'src/lib/d.ts' },
	];

	it('filters candidates with DISJOINT / DIFFERENCE criteria to prevent leakage', () => {
		const result = filterCandidateSetOverlapV1({
			setRevisionA: 'rev:split-train:v1',
			setRevisionB: 'rev:split-test:v1',
			candidatesA: setA,
			candidatesB: setB,
			criteria: 'DISJOINT',
		});

		expect(result.totalOutput).toBe(2);
		expect(result.filteredCandidates.map((c) => c.candidateId)).toEqual(['cand:1', 'cand:3']);
		expect(result.overlapCandidateIds).toEqual(['cand:2']);
		expect(result.overlapFraction).toBeCloseTo(1 / 3);
		expect(result.canonicalAuthority).toBe(false);
		expect(result.writesPerformed).toBe(false);
	});

	it('filters candidates with INTERSECTION criteria to retain shared elements', () => {
		const result = filterCandidateSetOverlapV1({
			setRevisionA: 'rev:split-train:v1',
			setRevisionB: 'rev:split-test:v1',
			candidatesA: setA,
			candidatesB: setB,
			criteria: 'INTERSECTION',
		});

		expect(result.totalOutput).toBe(1);
		expect(result.filteredCandidates.map((c) => c.candidateId)).toEqual(['cand:2']);
		expect(result.overlapCandidateIds).toEqual(['cand:2']);
	});

	it('combines candidates with UNION_DISTINCT preserving order and deduplication', () => {
		const result = filterCandidateSetOverlapV1({
			setRevisionA: 'rev:split-train:v1',
			setRevisionB: 'rev:split-test:v1',
			candidatesA: setA,
			candidatesB: setB,
			criteria: 'UNION_DISTINCT',
		});

		expect(result.totalOutput).toBe(4);
		expect(result.filteredCandidates.map((c) => c.candidateId)).toEqual([
			'cand:1',
			'cand:2',
			'cand:3',
			'cand:4',
		]);
	});

	it('fails closed on missing revision identifiers', () => {
		expect(() =>
			filterCandidateSetOverlapV1({
				setRevisionA: '',
				setRevisionB: 'rev:valid',
				candidatesA: setA,
				candidatesB: setB,
				criteria: 'DISJOINT',
			}),
		).toThrow();
	});
});
