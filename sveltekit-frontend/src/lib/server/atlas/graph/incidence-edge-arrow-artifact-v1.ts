import { createHash } from 'node:crypto';
import { Int32, Table, Utf8, tableFromIPC, tableToIPC, vectorFromArray } from 'apache-arrow';
import type { IncidenceProjectionEdgeV1 } from './incidence-projection-v1.js';

/**
 * GRAPH-PROD-01: the real edge-artifact serializer StructuralGraphSnapshotV1
 * has always required (`edgeArtifact.format === 'ARROW_IPC'`) but never had
 * an implementation -- apache-arrow was a listed dependency with zero import
 * sites anywhere in the repo before this file. This is the first one.
 *
 * Column layout matches IncidenceProjectionEdgeV1 field-for-field. No
 * reordering, no derived columns -- the artifact is a faithful serialization
 * of the edge table, not a separate representation with its own drift risk.
 *
 * IMPORTANT: `tableFromArrays()` auto-dictionary-encodes plain string[]
 * columns (Dictionary<Int32, Utf8>), and each independently-built dictionary
 * gets its own internal id embedded in the IPC dictionary-batch header — so
 * two calls with byte-identical logical content produced DIFFERENT IPC bytes
 * (confirmed live: 1744 vs 1776 bytes for the same two-row table). That
 * breaks determinism for anything that checksums this artifact. Building
 * each string column explicitly as `vectorFromArray(values, new Utf8())`
 * (never letting the library choose dictionary encoding) is what makes
 * `checksumArrowIpc()` reproducible — confirmed live via a round-trip
 * determinism check before this fix landed.
 */
export function serializeIncidenceEdgesToArrowIpc(edges: readonly IncidenceProjectionEdgeV1[]): Uint8Array {
	const table = new Table({
		srcGpuNodeId: vectorFromArray(edges.map((edge) => edge.srcGpuNodeId), new Int32()),
		dstGpuNodeId: vectorFromArray(edges.map((edge) => edge.dstGpuNodeId), new Int32()),
		edgeType: vectorFromArray(edges.map((edge) => edge.edgeType), new Utf8()),
		participantRole: vectorFromArray(edges.map((edge) => edge.participantRole), new Utf8()),
		participantOrdinal: vectorFromArray(edges.map((edge) => edge.participantOrdinal), new Int32()),
		relationId: vectorFromArray(edges.map((edge) => edge.relationId), new Utf8()),
		weight: vectorFromArray(edges.map((edge) => edge.weight), new Int32()),
	});
	return tableToIPC(table, 'stream');
}

export function checksumArrowIpc(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex');
}

/** Inverse of serializeIncidenceEdgesToArrowIpc, for round-trip determinism proofs. */
export function deserializeIncidenceEdgesFromArrowIpc(bytes: Uint8Array): IncidenceProjectionEdgeV1[] {
	const table = tableFromIPC(bytes);
	const rows: IncidenceProjectionEdgeV1[] = [];
	for (let index = 0; index < table.numRows; index += 1) {
		rows.push({
			srcGpuNodeId: Number(table.getChild('srcGpuNodeId')!.get(index)),
			dstGpuNodeId: Number(table.getChild('dstGpuNodeId')!.get(index)),
			edgeType: table.getChild('edgeType')!.get(index) as 'INCIDENT_TO',
			participantRole: table.getChild('participantRole')!.get(index) as string,
			participantOrdinal: Number(table.getChild('participantOrdinal')!.get(index)),
			relationId: table.getChild('relationId')!.get(index) as string,
			weight: table.getChild('weight')!.get(index) as 1,
		});
	}
	return rows;
}
