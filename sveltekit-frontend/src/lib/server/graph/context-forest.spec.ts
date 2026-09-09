import { describe, expect, it } from 'vitest';
import { sampleContextForest } from './context-forest.js';

describe('ContextForestV1', () => {
	it('is deterministic and bounded', () => {
		const input = {
			workspaceRevision: 'workspace:r1',
			graphRevision: 'graph:r1',
			ordinalMapChecksum: 'sha256:ord',
			policyRevision: 'forest-policy:r1',
			roots: [2, 0, 2],
			edges: [
				{ from: 0, to: 1, edgeType: 'CALLS', score: 0.9, tokenCost: 4 },
				{ from: 0, to: 3, edgeType: 'IMPORTS', score: 0.8, tokenCost: 4 },
				{ from: 1, to: 4, edgeType: 'TESTS', score: 0.7, tokenCost: 4 },
				{ from: 2, to: 5, edgeType: 'REFERENCES', score: 0.95, tokenCost: 4 },
			],
			maxNodes: 5,
			maxEdges: 3,
			maxDepth: 2,
			maxTokenCost: 20,
		};
		const first = sampleContextForest(input);
		const second = sampleContextForest({ ...input, edges: [...input.edges].reverse() });
		expect(first).toEqual(second);
		expect(first.nodeOrdinals).toHaveLength(5);
		expect(first.edges).toHaveLength(3);
		expect(first.roots).toEqual([0, 2]);
		expect(first.schema).toBe('atlas.context-forest.v1');
	});
});
