import { createHash } from 'node:crypto';

/**
 * Pure mapping from the existing GraphSnapshotMaterialization node/edge shape
 * (graph-snapshot-materializer.ts) to the flat row shape the
 * GRAPH_SNAPSHOT_PARITY contract requires for nodes.parquet / edges.parquet.
 * No I/O here — the exporter script owns Postgres/DuckDB/file writes.
 */

export interface GraphSnapshotParityNodeInput {
	nodeKey: string;
	nodeType: string;
	sourceRef?: string | null;
	packetKey?: string | null;
}

export interface GraphSnapshotParityEdgeInput {
	sourceNodeKey: string;
	targetNodeKey: string;
	edgeType: string;
	weight: number;
}

export interface GraphSnapshotParityNodeRow {
	gpu_node_id: number;
	graph_node_key: string;
	node_kind: string;
	source_ref: string | null;
	/** Not yet a proven identity axis (see memory: source_revision SOURCE_NOT_LOCATED). Always null until a real writer exists. */
	source_revision: string | null;
	packet_key: string | null;
	/** Not yet wired to a symbol identity table. Always null until that axis is proven. */
	symbol_id: string | null;
	symbol_version_id: string | null;
}

export interface GraphSnapshotParityEdgeRow {
	src_gpu_node_id: number;
	dst_gpu_node_id: number;
	edge_type: string;
	weight: number;
}

export interface GraphSnapshotParityTables {
	nodeRows: GraphSnapshotParityNodeRow[];
	edgeRows: GraphSnapshotParityEdgeRow[];
	/** Edges whose source or target nodeKey was not present in the node set. Dropped, not silently included. */
	unresolvedEdgeCount: number;
	nodeTableHash: string;
	edgeTableHash: string;
}

export function hashGraphSnapshotParityRows(rows: readonly (GraphSnapshotParityNodeRow | GraphSnapshotParityEdgeRow)[]): string {
	const hash = createHash('sha256');
	hash.update('[');
	rows.forEach((row, index) => {
		if (index > 0) hash.update(',');
		hash.update(JSON.stringify(row, Object.keys(row).sort()));
	});
	hash.update(']');
	return hash.digest('hex');
}

export function buildGraphSnapshotParityTables(input: {
	nodes: readonly GraphSnapshotParityNodeInput[];
	edges: readonly GraphSnapshotParityEdgeInput[];
}): GraphSnapshotParityTables {
	const nodeIndex = new Map<string, number>();
	const nodeRows: GraphSnapshotParityNodeRow[] = input.nodes.map((node, index) => {
		nodeIndex.set(node.nodeKey, index);
		return {
			gpu_node_id: index,
			graph_node_key: node.nodeKey,
			node_kind: node.nodeType,
			source_ref: node.sourceRef ?? null,
			source_revision: null,
			packet_key: node.packetKey ?? null,
			symbol_id: null,
			symbol_version_id: null
		};
	});

	let unresolvedEdgeCount = 0;
	const edgeRows: GraphSnapshotParityEdgeRow[] = [];
	for (const edge of input.edges) {
		const srcId = nodeIndex.get(edge.sourceNodeKey);
		const dstId = nodeIndex.get(edge.targetNodeKey);
		if (srcId === undefined || dstId === undefined) {
			unresolvedEdgeCount += 1;
			continue;
		}
		edgeRows.push({
			src_gpu_node_id: srcId,
			dst_gpu_node_id: dstId,
			edge_type: edge.edgeType,
			weight: edge.weight
		});
	}

	return {
		nodeRows,
		edgeRows,
		unresolvedEdgeCount,
		nodeTableHash: hashGraphSnapshotParityRows(nodeRows),
		edgeTableHash: hashGraphSnapshotParityRows(edgeRows)
	};
}
