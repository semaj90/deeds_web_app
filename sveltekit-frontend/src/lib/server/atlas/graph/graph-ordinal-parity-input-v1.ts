import type { GraphOrdinalMapV1 } from './graph-ordinal-map-v1.js';
import { compileGraphOrdinalEdgesV1, type GraphOrdinalEdgeV1 } from './graph-ordinal-edge-compiler-v1.js';
import type { GraphNodeKeyV1 } from '@deeds/parent-atlas';

export type GraphOrdinalParityInputV1 = {
	schema: 'atlas.graph-ordinal-parity-input.v1';
	graphRevision: string;
	workspaceRevision: string;
	graphOrdinalMapChecksum: string;
	nodes: GraphOrdinalMapV1['rows'];
	edges: GraphOrdinalEdgeV1[];
	canonicalAuthority: false;
	writes: false;
};

/** Builds one immutable CPU/GPU parity input from a shared ordinal map. */
export function buildGraphOrdinalParityInputV1(input: {
	map: GraphOrdinalMapV1;
	edges: readonly { sourceNodeKey: GraphNodeKeyV1; targetNodeKey: GraphNodeKeyV1; weight?: number; edgeType?: string }[];
}): GraphOrdinalParityInputV1 {
	return {
		schema: 'atlas.graph-ordinal-parity-input.v1',
		graphRevision: input.map.graphRevision,
		workspaceRevision: input.map.workspaceRevision,
		graphOrdinalMapChecksum: input.map.graphOrdinalMapChecksum,
		nodes: input.map.rows,
		edges: compileGraphOrdinalEdgesV1({ map: input.map, edges: input.edges }),
		canonicalAuthority: false,
		writes: false,
	};
}
