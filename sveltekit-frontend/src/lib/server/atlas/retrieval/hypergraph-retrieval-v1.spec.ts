import { describe, expect, it } from 'vitest';
import { parseHyperRelationV1 } from '../graph/hyper-relation-v1.js';
import { retrieveHypergraphContextV1 } from './hypergraph-retrieval-v1.js';

function relation(input: {
	relationId: string;
	relationType: string;
	participants: Array<{ canonicalId: string; role: string; ordinal: number }>;
	evidenceRefs?: string[];
}) {
	return parseHyperRelationV1({
		schema: 'atlas.hyper-relation.v1',
		relationId: input.relationId,
		relationType: input.relationType,
		participants: input.participants,
		evidenceRefs: input.evidenceRefs ?? [`evidence:${input.relationId}`],
		workspaceRevision: 'workspace:r1',
		sourceRevision: 'source:r1',
		producerRevision: 'producer:r1',
	});
}

const budget = {
	maxSeeds: 8,
	maxRelations: 16,
	maxEntities: 32,
	maxHops: 2,
	maxEvidenceRefs: 64,
};

describe('retrieveHypergraphContextV1', () => {
	it('preserves a ternary relation instead of inventing pairwise facts', () => {
		const result = retrieveHypergraphContextV1({
			workspaceRevision: 'workspace:r1',
			sourceRevision: 'source:r1',
			queryRevision: 'query:q1',
			mode: 'hybrid',
			seeds: [{ canonicalId: 'symbol:A', score: 0.95, source: 'semantic_768', evidenceRef: 'knn:A' }],
			relations: [
				relation({
					relationId: 'rel:R',
					relationType: 'CALLS_WITH_CONTEXT',
					participants: [
						{ canonicalId: 'symbol:A', role: 'caller', ordinal: 0 },
						{ canonicalId: 'symbol:B', role: 'callee', ordinal: 1 },
						{ canonicalId: 'context:C', role: 'context', ordinal: 2 },
					],
				}),
			],
			budget,
		});

		expect(result.relations).toHaveLength(1);
		expect(result.relations[0].relationId).toBe('rel:R');
		expect(result.relations[0].participantIds).toEqual(['symbol:A', 'symbol:B', 'context:C']);
		expect(result.entityIds).toEqual(['context:C', 'symbol:A', 'symbol:B']);
	});

	it('expands relation-to-entity-to-relation under a bounded hop budget', () => {
		const result = retrieveHypergraphContextV1({
			workspaceRevision: 'workspace:r1',
			sourceRevision: 'source:r1',
			queryRevision: 'query:q2',
			mode: 'entity',
			seeds: [{ canonicalId: 'A', score: 1, source: 'human', evidenceRef: 'seed:A' }],
			relations: [
				relation({
					relationId: 'R1',
					relationType: 'FIRST',
					participants: [
						{ canonicalId: 'A', role: 'a', ordinal: 0 },
						{ canonicalId: 'B', role: 'b', ordinal: 1 },
					],
				}),
				relation({
					relationId: 'R2',
					relationType: 'SECOND',
					participants: [
						{ canonicalId: 'B', role: 'b', ordinal: 0 },
						{ canonicalId: 'C', role: 'c', ordinal: 1 },
					],
				}),
			],
			budget: { ...budget, maxHops: 1 },
		});

		expect(result.relations.map((item) => item.relationId)).toEqual(['R1', 'R2']);
		expect(result.entityIds).toEqual(['A', 'B', 'C']);
	});

	it('ignores relations from other source revisions', () => {
		const other = {
			...relation({
				relationId: 'R-other',
				relationType: 'OTHER',
				participants: [
					{ canonicalId: 'A', role: 'a', ordinal: 0 },
					{ canonicalId: 'Z', role: 'z', ordinal: 1 },
				],
			}),
			sourceRevision: 'source:r2',
		};
		const result = retrieveHypergraphContextV1({
			workspaceRevision: 'workspace:r1',
			sourceRevision: 'source:r1',
			queryRevision: 'query:q3',
			mode: 'hybrid',
			seeds: [{ canonicalId: 'A', score: 1, source: 'semantic_768', evidenceRef: 'seed:A' }],
			relations: [other],
			budget,
		});
		expect(result.relations).toEqual([]);
		expect(result.entityIds).toEqual(['A']);
	});

	// KAG-05I: bounded multi-hop retrieval proof. A -[R1]-> B -[R2]-> C -[R3]-> D
	// is a genuine 3-hop chain; these two cases prove the hop budget actually
	// stops expansion (not just that budgets exist) and that hitting it is
	// reported via `truncated`, never silently.
	const chain = [
		relation({ relationId: 'R1', relationType: 'NEXT', participants: [{ canonicalId: 'A', role: 'from', ordinal: 0 }, { canonicalId: 'B', role: 'to', ordinal: 1 }] }),
		relation({ relationId: 'R2', relationType: 'NEXT', participants: [{ canonicalId: 'B', role: 'from', ordinal: 0 }, { canonicalId: 'C', role: 'to', ordinal: 1 }] }),
		relation({ relationId: 'R3', relationType: 'NEXT', participants: [{ canonicalId: 'C', role: 'from', ordinal: 0 }, { canonicalId: 'D', role: 'to', ordinal: 1 }] }),
	];

	it('stops expansion at the hop budget and reports truncated instead of claiming complete coverage', () => {
		const result = retrieveHypergraphContextV1({
			workspaceRevision: 'workspace:r1',
			sourceRevision: 'source:r1',
			queryRevision: 'query:q4',
			mode: 'entity',
			seeds: [{ canonicalId: 'A', score: 1, source: 'human', evidenceRef: 'seed:A' }],
			relations: chain,
			budget: { ...budget, maxHops: 1 },
		});

		expect(result.relations.map((item) => item.relationId)).toEqual(['R1', 'R2']);
		expect(result.entityIds).toEqual(['A', 'B', 'C']);
		expect(result.entityIds).not.toContain('D');
		expect(result.truncated).toBe(true);
	});

	it('does not mark truncated once the reachable graph is fully explored within budget', () => {
		const result = retrieveHypergraphContextV1({
			workspaceRevision: 'workspace:r1',
			sourceRevision: 'source:r1',
			queryRevision: 'query:q5',
			mode: 'entity',
			seeds: [{ canonicalId: 'A', score: 1, source: 'human', evidenceRef: 'seed:A' }],
			relations: chain,
			budget: { ...budget, maxHops: 3 },
		});

		expect(result.relations.map((item) => item.relationId)).toEqual(['R1', 'R2', 'R3']);
		expect(result.entityIds).toEqual(['A', 'B', 'C', 'D']);
		expect(result.truncated).toBe(false);
	});
});
