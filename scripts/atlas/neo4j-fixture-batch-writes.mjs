const ALLOWED_EDGE_TYPES = new Set([
	'CONTAINS', 'MATERIALIZES', 'IMPORTS', 'CALLS', 'REFERENCES', 'DEPENDS_ON',
	'IMPLEMENTS', 'USES_CONCEPT', 'PARTICIPATES_IN',
]);

export const NEO4J_FIXTURE_WRITE_BATCH_SIZE = 1000;

export function validateFixtureEdges(edges) {
	for (const edge of edges) {
		if (!ALLOWED_EDGE_TYPES.has(edge.edgeType)) throw new Error(`Unsupported fixture relationship type: ${edge.edgeType}`);
	}
}

function batches(items, size) {
	if (!Number.isInteger(size) || size < 1) throw new RangeError('BATCH_SIZE_MUST_BE_POSITIVE_INTEGER');
	const result = [];
	for (let offset = 0; offset < items.length; offset += size) result.push(items.slice(offset, offset + size));
	return result;
}

export async function writeFixtureNodesBatched(session, nodes, { snapshotId, fixtureRunId, batchSize = NEO4J_FIXTURE_WRITE_BATCH_SIZE }) {
	let calls = 0;
	for (const rows of batches(nodes, batchSize)) {
		await session.run(
			`UNWIND $rows AS row
			 CREATE (:AtlasContextNode {
			   snapshot_id: row.snapshotId,
			   fixture_run_id: row.fixtureRunId,
			   node_key: row.nodeKey,
			   node_type: row.nodeType,
			   packet_key: row.packetKey,
			   tree_node_id: row.treeNodeId,
			   source_ref: row.sourceRef
			 })`,
			{ rows: rows.map((node) => ({ ...node, snapshotId, fixtureRunId })) },
		);
		calls += 1;
	}
	return calls;
}

export async function writeFixtureEdgesBatched(session, edges, { snapshotId, fixtureRunId, batchSize = NEO4J_FIXTURE_WRITE_BATCH_SIZE }) {
	validateFixtureEdges(edges);
	const groups = new Map();
	for (const edge of edges) {
		const group = groups.get(edge.edgeType) ?? [];
		group.push(edge);
		groups.set(edge.edgeType, group);
	}
	let calls = 0;
	for (const edgeType of [...groups.keys()].sort()) {
		for (const rows of batches(groups.get(edgeType), batchSize)) {
			await session.run(
				`UNWIND $rows AS row
				 MATCH (source:AtlasContextNode {snapshot_id: $snapshotId, fixture_run_id: $fixtureRunId, node_key: row.sourceNodeKey})
				 MATCH (target:AtlasContextNode {snapshot_id: $snapshotId, fixture_run_id: $fixtureRunId, node_key: row.targetNodeKey})
				 CREATE (source)-[r:${edgeType} {
				   edge_key: row.edgeKey,
				   weight: row.weight,
				   confidence: row.confidence
				 }]->(target)`,
				{ snapshotId, fixtureRunId, rows },
			);
			calls += 1;
		}
	}
	return calls;
}
