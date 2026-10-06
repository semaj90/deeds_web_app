import { pool } from '$lib/server/db/client.js';
import { resolveIncidenceEndpointsV1, type AtlasPacketRowV1, type EndpointResolutionV1 } from '../lineage/packet-incidence-endpoint-resolver-v1.js';
import { verifyGraphRevisionSnapshotV1, type GraphRevisionSnapshotV1 } from '../lineage/graph-revision-snapshot-v1.js';
import type { GraphifyEdgeProjectionCandidateV1 } from './graphify-symbol-projection-v1.js';

export type ResolvedGraphifyPacketEndpointV1 = EndpointResolutionV1 & {
	graphEndpointKey: string;
	sourceRef: string;
	workspaceRevision: string;
	graphRevision: string;
};

interface GraphifySymbolPacketJoinRowV1 extends AtlasPacketRowV1 {
	stable_symbol_key: string;
	workspace_revision: string;
	code_source_revision: string | null;
	workspace_revision_key: string | null;
}

export async function resolveGraphifyPacketIncidenceEndpointsV1(
	edge: GraphifyEdgeProjectionCandidateV1,
	snapshot: GraphRevisionSnapshotV1,
): Promise<{ packet: ResolvedGraphifyPacketEndpointV1; neighbor: ResolvedGraphifyPacketEndpointV1 }> {
	if (!verifyGraphRevisionSnapshotV1(snapshot)) throw new Error('GRAPHIFY_PACKET_INCIDENCE_SNAPSHOT_INVALID');
	if (edge.workspaceRevision !== snapshot.workspaceRevisionKey) throw new Error('GRAPHIFY_PACKET_INCIDENCE_WORKSPACE_SNAPSHOT_MISMATCH');
	if (!edge.objectStableSymbolKey || edge.unresolvedTarget) throw new Error('GRAPHIFY_PACKET_INCIDENCE_TARGET_UNRESOLVED');
	const symbolKeys = [...new Set([edge.subjectStableSymbolKey, edge.objectStableSymbolKey])];
	const result = await pool.query<GraphifySymbolPacketJoinRowV1>(
		`SELECT symbol.stable_symbol_key, file.workspace_revision, file.code_source_revision,
	        packet.packet_key, packet.source_ref, packet.source_revision,
	        packet.workspace_revision_key
	   FROM graphify_symbols AS symbol
	   JOIN graphify_files AS file ON file.file_id = symbol.file_id
	   JOIN atlas_packets AS packet
	     ON packet.source_ref = file.source_ref
	    AND packet.source_revision = file.code_source_revision
	    AND packet.byte_start <= symbol.start_byte
	    AND packet.byte_end >= symbol.end_byte
	  WHERE file.workspace_id = $1
	    AND file.workspace_revision = $2
	    AND symbol.stable_symbol_key = ANY($3::text[])
	    AND file.code_source_revision IS NOT NULL
	    AND packet.packet_key IS NOT NULL
	  ORDER BY symbol.stable_symbol_key, packet.packet_key`,
		[edge.workspaceId, edge.workspaceRevision, symbolKeys],
	);
	const grouped = new Map<string, GraphifySymbolPacketJoinRowV1[]>();
	for (const row of result.rows) grouped.set(row.stable_symbol_key, [...(grouped.get(row.stable_symbol_key) ?? []), row]);
	const subjectRows = grouped.get(edge.subjectStableSymbolKey) ?? [];
	const neighborRows = grouped.get(edge.objectStableSymbolKey) ?? [];
	if (subjectRows.length !== 1) throw new Error(`GRAPHIFY_PACKET_SUBJECT_JOIN_NOT_UNIQUE:${subjectRows.length}`);
	if (neighborRows.length !== 1) throw new Error(`GRAPHIFY_PACKET_NEIGHBOR_JOIN_NOT_UNIQUE:${neighborRows.length}`);
	const subject = subjectRows[0]!;
	const neighbor = neighborRows[0]!;
	if (subject.source_ref !== edge.sourceRef || subject.source_revision !== edge.sourceRevision
		|| subject.code_source_revision !== edge.sourceRevision || subject.workspace_revision !== edge.workspaceRevision) {
		throw new Error('GRAPHIFY_PACKET_SUBJECT_REVISION_BINDING_MISMATCH');
	}
	if (subject.workspace_revision_key !== edge.workspaceRevision) {
		throw new Error('GRAPHIFY_PACKET_SUBJECT_WORKSPACE_REVISION_BINDING_MISMATCH');
	}
	if (neighbor.workspace_revision !== edge.workspaceRevision
		|| !neighbor.code_source_revision || neighbor.source_revision !== neighbor.code_source_revision) {
		throw new Error('GRAPHIFY_PACKET_NEIGHBOR_REVISION_BINDING_MISMATCH');
	}
	if (neighbor.workspace_revision_key !== edge.workspaceRevision) {
		throw new Error('GRAPHIFY_PACKET_NEIGHBOR_WORKSPACE_REVISION_BINDING_MISMATCH');
	}
	const packetRows = [subject, neighbor];
	const { resolvePacketKeyResolutionV2 } = await import('../identity/packet-identity-resolver.js');
	const resolutions = await resolveIncidenceEndpointsV1(
		packetRows.map((row) => row.packet_key),
		async (keys) => {
			const readback = await pool.query<AtlasPacketRowV1 & { workspace_revision_key: string | null }>(
				'SELECT packet_key, source_ref, source_revision, workspace_revision_key FROM atlas_packets WHERE packet_key = ANY($1::text[])',
				[keys],
			);
			if (readback.rows.some((row) => row.workspace_revision_key !== edge.workspaceRevision)) {
				throw new Error('GRAPHIFY_PACKET_IDENTITY_READBACK_WORKSPACE_REVISION_MISMATCH');
			}
			return readback.rows;
		},
		async (key) => {
			try {
				const resolution = await resolvePacketKeyResolutionV2(key);
				return resolution.storagePacketKey === key ? resolution.canonicalPacketKey : null;
			} catch {
				return null;
			}
		},
	);
	const toEndpoint = (row: GraphifySymbolPacketJoinRowV1): ResolvedGraphifyPacketEndpointV1 => {
		const resolution = resolutions.get(row.packet_key);
		if (resolution?.status !== 'RESOLVED' || resolution.sourceRevision !== row.source_revision) {
			throw new Error(`GRAPHIFY_PACKET_ENDPOINT_REVISION_UNPROVEN:${row.packet_key}`);
		}
		return {
			...resolution,
			graphEndpointKey: row.stable_symbol_key,
			sourceRef: row.source_ref!,
			workspaceRevision: row.workspace_revision,
			graphRevision: snapshot.graphRevision,
		};
	};
	return { packet: toEndpoint(subject), neighbor: toEndpoint(neighbor) };
}
