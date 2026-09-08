// @vitest-environment node
//
// Live (non-mocked) runtime proof for the hyperedge half of the "Graph retrieval / projection"
// cluster in openspec/changes/parent-atlas-trace-search-joinback-proof/tasks.md's
// "Repository-first search inventory". This is a distinct mechanism from the Neo4j
// relationship-kernel path (src/lib/server/atlas/graph/relationship-kernel-neo4j-projector-v1.ts)
// -- traverseHop1() reads Postgres-backed hyperedges via searchHyperedges(), not Neo4j.
//
// Opt-in only via RUN_DB_INTEGRATION=1.

import { describe, expect, it } from 'vitest';

const RUN_DB_INTEGRATION = process.env.RUN_DB_INTEGRATION === '1';
const describeIf = RUN_DB_INTEGRATION ? describe : describe.skip;

describeIf('traverseHop1 (live Postgres hyperedge store)', () => {
	it('round-trips through searchHyperedges without throwing for a non-existent anchor', async () => {
		const { traverseHop1 } = await import('./hypergraph-traversal.js');

		const result = await traverseHop1('runtime-proof-nonexistent-anchor', 5);

		expect(result.mode).toBe('hop1');
		expect(result.anchor_key).toBe('runtime-proof-nonexistent-anchor');
		expect(result.totalHops).toBe(1);
		expect(Array.isArray(result.edges)).toBe(true);
		expect(result.steps).toHaveLength(1);
		expect(result.steps[0]!.hop).toBe(1);
		expect(typeof result.durationMs).toBe('number');
	});
});
