import { describe, expect, it } from 'vitest';

import type { AtlasRevisionSet, CandidateV1, ResourceEnvelopeV1 } from '../contracts/bounded-resolution.js';
import {
	addResourceUsage,
	emptyResourceUsage,
	remainingCandidateCapacity,
	resourceBoundaryReasons,
} from './budget.js';
import { projectHyperedgesToWeightedEdges } from './hypergraph.js';
import { decodeKBestLineages } from './lineage.js';
import { buildRouteMask, hasRouteFlag, routeHammingDistance } from './route-mask.js';
import { canonicalSetDelta, isStableDelta } from './stability.js';

const revisions: AtlasRevisionSet = {
	workspace: 'workspace@1',
	source: 'source@1',
	graph: 'graph@1',
	feature: 'feature@1',
};

function candidate(canonicalId: string, score: number): CandidateV1 {
	return {
		canonicalId,
		score,
		evidence: { semantic: score },
		revisions,
		evidenceRefs: [`evidence:${canonicalId}`],
	};
}

describe('Parent Atlas bounded resolution primitives', () => {
	it('measures canonical candidate stabilization with Jaccard delta', () => {
		expect(canonicalSetDelta(['a', 'b'], ['a', 'b'])).toBe(0);
		expect(canonicalSetDelta(['a', 'b'], ['a', 'b', 'c', 'd'])).toBeCloseTo(0.5);
		expect(canonicalSetDelta([], [])).toBe(0);
		expect(isStableDelta(0.05, 0.1)).toBe(true);
		expect(isStableDelta(0.2, 0.1)).toBe(false);
	});

	it('uses Hamming distance only for compact control-plane route masks', () => {
		const a = buildRouteMask({ semanticRequired: true, astRequired: true, sourceRequired: true });
		const b = buildRouteMask({ semanticRequired: true, graphRequired: true, sourceRequired: true });

		expect(routeHammingDistance(a, b)).toBe(2);
		expect(hasRouteFlag(a, 'astRequired')).toBe(true);
		expect(hasRouteFlag(a, 'graphRequired')).toBe(false);
	});

	it('decodes the globally stronger revision lineage deterministically', () => {
		const paths = decodeKBestLineages(
			[
				{ revisions, candidates: [candidate('old-a', 0.9), candidate('old-b', 0.8)] },
				{ revisions, candidates: [candidate('new-a', 0.7), candidate('new-b', 0.95)] },
			],
			({ from, to }) => (from.canonicalId.endsWith(to.canonicalId.slice(-1)) ? 1 : -1),
			2,
		);

		expect(paths[0].candidateIds).toEqual(['old-b', 'new-b']);
	});

	it('keeps canonical n-ary evidence while producing a disposable graph projection', () => {
		const projection = projectHyperedgesToWeightedEdges([
			{
				hyperedgeId: 'mutation-1',
				predicate: 'MUTATION_EVENT',
				participants: [
					{ canonicalId: 'agent', role: 'agent' },
					{ canonicalId: 'symbol', role: 'target' },
					{ canonicalId: 'receipt', role: 'receipt' },
				],
				evidenceRefs: ['evidence:mutation-1'],
				workspaceRevision: revisions.workspace,
				graphRevision: revisions.graph,
				sourceRevision: revisions.source,
				producerRevision: 'producer@1',
				checksum: 'checksum-1',
			},
		]);

		expect(projection).toHaveLength(6);
		expect(projection.every((edge) => edge.weight === 0.5)).toBe(true);
		expect(projection.every((edge) => edge.evidenceHyperedgeIds.includes('mutation-1'))).toBe(true);
	});

	it('reports finite budget exhaustion without treating it as negative proof', () => {
		const budget: ResourceEnvelopeV1 = {
			maxVramBytes: 8_000,
			maxContextTokens: 8_000,
			maxCandidates: 4,
			maxGraphHops: 8,
			maxHyperedges: 32,
			maxToolCalls: 16,
			maxWallMs: 10_000,
		};
		const usage = addResourceUsage(emptyResourceUsage(), { candidateCount: 4, toolCalls: 2 });

		expect(resourceBoundaryReasons(budget, usage)).toEqual(['CANDIDATE_BUDGET']);
		expect(remainingCandidateCapacity(budget, usage)).toBe(0);
	});
});
