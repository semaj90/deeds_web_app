import { describe, expect, it } from 'vitest';
import { turbovecRerank } from './turbovec-rerank.js';

describe('turbovecRerank tree fan-out', () => {
	it('promotes an exact tree-node match after semantic candidate generation', async () => {
		const result = await turbovecRerank({
			query: 'find the packet branch for validation',
			hits: [
				{ id: 'semantic-first', score: 0.9, payload: { packet_key: 'p1', tree_node_id: 'tree-a' } },
				{ id: 'tree-match', score: 0.8, payload: { packet_key: 'p2', tree_node_id: 'tree-b' } },
			],
			graphHints: { targetTreeNodeId: 'tree-b' },
		});

		expect(result.ok).toBe(true);
		expect(result.hits[0]?.id).toBe('tree-match');
	});

	it('uses packet or tree authority without requiring a file path', async () => {
		const result = await turbovecRerank({
			query: 'expand authoritative packet',
			hits: [
				{ id: 'a', score: 0.81, payload: { packet_key: 'packet-a', tree_node_id: 'tree-a' } },
				{ id: 'b', score: 0.8, payload: { packet_key: 'packet-b', tree_node_id: 'tree-b' } },
			],
			graphHints: { authorityScores: { 'tree-b': 1 } },
		});

		expect(result.hits[0]?.id).toBe('b');
	});
});
