import { describe, expect, it } from 'vitest';

import { projectNaryRelationForRanking } from './nary-ranking-projection.js';

describe('projectNaryRelationForRanking', () => {
	it('preserves a ternary relation through one relation node instead of a participant clique', () => {
		const projected = projectNaryRelationForRanking({
			relationId: 'call:1',
			predicate: 'CALLS_WITH_CONTEXT',
			participants: [
				{ canonicalId: 'symbol:A', role: 'caller' },
				{ canonicalId: 'symbol:B', role: 'callee' },
				{ canonicalId: 'file:C', role: 'context' },
			],
		});

		expect(projected.relationNodeId).toBe('relation:call:1');
		expect(projected.edges).toHaveLength(6);
		expect(projected.edges.every((edge) => edge.source === projected.relationNodeId || edge.target === projected.relationNodeId)).toBe(true);
		expect(projected.edges.some((edge) => edge.source === 'symbol:A' && edge.target === 'symbol:B')).toBe(false);
	});

	it('keeps participant roles and weights on derived edges', () => {
		const projected = projectNaryRelationForRanking({
			relationId: 'r2',
			predicate: 'DEPENDS_ON_FOR',
			participants: [
				{ canonicalId: 'a', role: 'subject', weight: 2 },
				{ canonicalId: 'b', role: 'object', weight: 0.5 },
			],
		});

		expect(projected.edges.filter((edge) => edge.role === 'subject').every((edge) => edge.weight === 2)).toBe(true);
		expect(projected.edges.filter((edge) => edge.role === 'object').every((edge) => edge.weight === 0.5)).toBe(true);
	});

	it('rejects malformed or duplicate participant identities', () => {
		expect(() => projectNaryRelationForRanking({
			relationId: 'bad',
			predicate: 'X',
			participants: [{ canonicalId: 'a', role: 'x' }],
		})).toThrow('at least two');

		expect(() => projectNaryRelationForRanking({
			relationId: 'dupe',
			predicate: 'X',
			participants: [
				{ canonicalId: 'a', role: 'x' },
				{ canonicalId: 'a', role: 'x' },
			],
		})).toThrow('duplicate participant identity');
	});
});
