import type { GraphNodeKeyV1 } from '@deeds/parent-atlas';
import type { GraphOrdinalMapV1 } from './graph-ordinal-map-v1.js';

export type GraphOrdinalEdgeV1 = {
	sourceOrdinal: number;
	targetOrdinal: number;
	weight: number;
	edgeType: string;
};

function ordinalByKey(map: GraphOrdinalMapV1): Map<GraphNodeKeyV1, number> {
	return new Map(map.rows.map((row) => [row.graphNodeKey, row.graphOrdinal]));
}

/** Compiles identity-keyed edges to executor coordinates without renumbering. */
export function compileGraphOrdinalEdgesV1(input: {
	map: GraphOrdinalMapV1;
	edges: readonly { sourceNodeKey: GraphNodeKeyV1; targetNodeKey: GraphNodeKeyV1; weight?: number; edgeType?: string }[];
	allowSelfLoops?: boolean;
}): GraphOrdinalEdgeV1[] {
	const ordinals = ordinalByKey(input.map);
	const compiled = input.edges.map((edge) => {
		const sourceOrdinal = ordinals.get(edge.sourceNodeKey);
		const targetOrdinal = ordinals.get(edge.targetNodeKey);
		if (sourceOrdinal == null || targetOrdinal == null) throw new Error('GRAPH_ORDINAL_EDGE_UNKNOWN_NODE');
		if (!input.allowSelfLoops && sourceOrdinal === targetOrdinal) throw new Error('GRAPH_ORDINAL_SELF_LOOP_DISALLOWED');
		if (edge.weight != null && (!Number.isFinite(edge.weight) || edge.weight < 0)) throw new Error('GRAPH_ORDINAL_EDGE_WEIGHT_INVALID');
		return { sourceOrdinal, targetOrdinal, weight: edge.weight ?? 1, edgeType: edge.edgeType ?? 'RELATED' };
	});
	return compiled.sort((a, b) => a.sourceOrdinal - b.sourceOrdinal || a.targetOrdinal - b.targetOrdinal || a.edgeType.localeCompare(b.edgeType) || a.weight - b.weight);
}
