import { createHash } from 'node:crypto';
import { graphNodeKeyV1Schema, type GraphNodeKeyV1 } from '@deeds/parent-atlas';

export type GraphOrdinalRowV1 = {
	graphOrdinal: number;
	graphNodeKey: GraphNodeKeyV1;
};

export type GraphOrdinalMapV1 = {
	schema: 'atlas.graph-ordinal-map.v1';
	graphRevision: string;
	workspaceRevision: string;
	rowCount: number;
	rows: GraphOrdinalRowV1[];
	graphOrdinalMapChecksum: string;
	canonicalAuthority: false;
	writes: false;
};

function digest(value: unknown): string {
	return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

/** Creates the executor-local dense coordinate map; it does not alter node identity. */
export function buildGraphOrdinalMapV1(input: {
	graphRevision: string;
	workspaceRevision: string;
	graphNodeKeys: readonly string[];
}): GraphOrdinalMapV1 {
	if (!input.graphRevision || !input.workspaceRevision) throw new Error('GRAPH_ORDINAL_REVISION_BINDING_REQUIRED');
	const keys = input.graphNodeKeys.map((key) => graphNodeKeyV1Schema.parse(key));
	if (new Set(keys).size !== keys.length) throw new Error('GRAPH_ORDINAL_DUPLICATE_NODE_KEY');
	const rows = [...keys].sort().map((graphNodeKey, graphOrdinal) => ({ graphOrdinal, graphNodeKey }));
	return {
		schema: 'atlas.graph-ordinal-map.v1',
		graphRevision: input.graphRevision,
		workspaceRevision: input.workspaceRevision,
		rowCount: rows.length,
		rows,
		graphOrdinalMapChecksum: digest({ graphRevision: input.graphRevision, workspaceRevision: input.workspaceRevision, rows }),
		canonicalAuthority: false,
		writes: false,
	};
}

export function graphNodeKeyForOrdinalV1(map: GraphOrdinalMapV1, graphOrdinal: number): GraphNodeKeyV1 | null {
	return map.rows.find((row) => row.graphOrdinal === graphOrdinal)?.graphNodeKey ?? null;
}
