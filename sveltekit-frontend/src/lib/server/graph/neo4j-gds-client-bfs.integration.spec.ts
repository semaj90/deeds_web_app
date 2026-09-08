// @vitest-environment node
//
// Live (non-mocked) runtime proof for GDS1.8 (parent-atlas-trace-search-joinback-proof/tasks.md):
// "Bounded breadth-first search tool (BreadthFirstSearchRequest/Result, APOC + pure-Cypher
// fallback, label/rel-type allowlists)".
//
// Real production Neo4j data does NOT populate `stableKey` on real nodes (found live 2026-09-08:
// `MATCH (n) WHERE n.stableKey IS NOT NULL RETURN count(n)` = 2, both stray leftover test rows
// from an earlier session's proof, not real graph content -- real CodebaseFile/ParentAtlasSource
// nodes use `path`/`sourceRef`/`featureId` for identity, not `stableKey`). This is a pre-existing
// gap shared with the sibling `expandGraphClient` (same `{stableKey: $stableKey}` seed match,
// unchanged here) -- flagged in tasks.md, not fixed as part of this task, since fixing it would
// mean changing an already-shipped function's identity contract, a separate decision. To prove
// `breadthFirstSearchClient` itself works correctly (BFS ordering, relationship-type allowlist,
// node-label allowlist, unknown-allowlist-entry reporting) without relying on that stray leftover
// data, this test creates its own isolated fixture subgraph, proves against it, then deletes it
// (zero footprint), the same pattern used for this session's earlier Neo4j fanout producer proof.
//
// Opt-in only via RUN_DB_INTEGRATION=1 (needs the live legal-ai-neo4j container).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const RUN_DB_INTEGRATION = process.env.RUN_DB_INTEGRATION === '1';
const describeIf = RUN_DB_INTEGRATION ? describe : describe.skip;

const FIXTURE_PREFIX = 'bfs-proof-2026-09-08';

describeIf('breadthFirstSearchClient (live Neo4j, GDS1.8)', () => {
	beforeAll(async () => {
		const { getNeo4jDriver } = await import('$lib/server/neo4j-driver.js');
		const session = getNeo4jDriver().session();
		try {
			// start --TEST_BFS_EDGE--> nodeA(TestBfsNode) --TEST_BFS_EDGE--> nodeC(TestBfsNode)
			// start --TEST_BFS_OTHER--> nodeB(TestBfsOtherLabel)
			await session.run(
				`
        CREATE (start:TestBfsNode {stableKey: $startKey, path: 'test/bfs/start'})
        CREATE (nodeA:TestBfsNode {stableKey: $nodeAKey, path: 'test/bfs/a'})
        CREATE (nodeB:TestBfsOtherLabel {stableKey: $nodeBKey, path: 'test/bfs/b'})
        CREATE (nodeC:TestBfsNode {stableKey: $nodeCKey, path: 'test/bfs/c'})
        CREATE (start)-[:TEST_BFS_EDGE]->(nodeA)
        CREATE (start)-[:TEST_BFS_OTHER]->(nodeB)
        CREATE (nodeA)-[:TEST_BFS_EDGE]->(nodeC)
      `,
				{
					startKey: `${FIXTURE_PREFIX}:start`,
					nodeAKey: `${FIXTURE_PREFIX}:a`,
					nodeBKey: `${FIXTURE_PREFIX}:b`,
					nodeCKey: `${FIXTURE_PREFIX}:c`,
				},
			);
		} finally {
			await session.close();
		}
	});

	afterAll(async () => {
		const { getNeo4jDriver } = await import('$lib/server/neo4j-driver.js');
		const session = getNeo4jDriver().session();
		try {
			await session.run(
				`MATCH (n) WHERE n.stableKey STARTS WITH $prefix DETACH DELETE n`,
				{ prefix: FIXTURE_PREFIX },
			);
		} finally {
			await session.close();
		}
	});

	it('traverses all reachable nodes in BFS order with no allowlist', async () => {
		const { breadthFirstSearchClient } = await import('./neo4j-gds-client.js');

		const result = await breadthFirstSearchClient({
			stableKey: `${FIXTURE_PREFIX}:start`,
			maxDepth: 2,
			limit: 10,
		});

		const keys = result.nodes.map((n) => n.stableKey).sort();
		expect(keys).toEqual([`${FIXTURE_PREFIX}:a`, `${FIXTURE_PREFIX}:b`, `${FIXTURE_PREFIX}:c`].sort());
		expect(result.ignoredRelationshipTypes).toEqual([]);
		expect(result.ignoredNodeLabels).toEqual([]);
		// BFS order: depth-1 nodes (a, b) must appear before the depth-2 node (c)
		const distanceByKey = new Map(result.nodes.map((n) => [n.stableKey, n.distance]));
		expect(distanceByKey.get(`${FIXTURE_PREFIX}:a`)).toBe(1);
		expect(distanceByKey.get(`${FIXTURE_PREFIX}:b`)).toBe(1);
		expect(distanceByKey.get(`${FIXTURE_PREFIX}:c`)).toBe(2);
	});

	it('excludes nodes reached only via a non-allowlisted relationship type', async () => {
		const { breadthFirstSearchClient } = await import('./neo4j-gds-client.js');

		const result = await breadthFirstSearchClient({
			stableKey: `${FIXTURE_PREFIX}:start`,
			maxDepth: 2,
			limit: 10,
			relationshipTypeAllowlist: ['TEST_BFS_EDGE'],
		});

		const keys = result.nodes.map((n) => n.stableKey).sort();
		expect(keys).toEqual([`${FIXTURE_PREFIX}:a`, `${FIXTURE_PREFIX}:c`].sort());
		expect(keys).not.toContain(`${FIXTURE_PREFIX}:b`);
	});

	it('excludes nodes not carrying an allowlisted label', async () => {
		const { breadthFirstSearchClient } = await import('./neo4j-gds-client.js');

		const result = await breadthFirstSearchClient({
			stableKey: `${FIXTURE_PREFIX}:start`,
			maxDepth: 2,
			limit: 10,
			nodeLabelAllowlist: ['TestBfsNode'],
		});

		const keys = result.nodes.map((n) => n.stableKey).sort();
		expect(keys).toEqual([`${FIXTURE_PREFIX}:a`, `${FIXTURE_PREFIX}:c`].sort());
		expect(keys).not.toContain(`${FIXTURE_PREFIX}:b`);
	});

	it('reports allowlist entries that do not exist live, without erroring', async () => {
		const { breadthFirstSearchClient } = await import('./neo4j-gds-client.js');

		const result = await breadthFirstSearchClient({
			stableKey: `${FIXTURE_PREFIX}:start`,
			maxDepth: 2,
			limit: 10,
			relationshipTypeAllowlist: ['TEST_BFS_EDGE', 'DOES_NOT_EXIST_ANYWHERE'],
			nodeLabelAllowlist: ['TestBfsNode', 'AlsoDoesNotExist'],
		});

		expect(result.ignoredRelationshipTypes).toEqual(['DOES_NOT_EXIST_ANYWHERE']);
		expect(result.ignoredNodeLabels).toEqual(['AlsoDoesNotExist']);
	});
});
