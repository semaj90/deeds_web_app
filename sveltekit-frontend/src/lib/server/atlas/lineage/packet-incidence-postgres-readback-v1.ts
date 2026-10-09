import { pool } from '$lib/server/db/client.js';
import {
	assertPacketIncidenceWorkspaceRevisionV1,
	expectedFromResolutionsV1,
	resolveIncidenceEndpointsV1,
	type AtlasPacketRowV1,
} from './packet-incidence-endpoint-resolver-v1.js';
import { verifyPacketIncidenceLineageV1, type PacketIncidenceLineageV1 } from './packet-incidence-lineage-v1.js';
import type { KagTraversalSnapshotV1 } from '../integration/kag-hypergraph-reader-v1.js';

export const MAX_PACKET_INCIDENCE_ENDPOINTS_V1 = 512;

export async function verifyPacketIncidenceLineagesAgainstPostgresV1(
	lineages: readonly PacketIncidenceLineageV1[],
	snapshot: KagTraversalSnapshotV1,
): Promise<void> {
	const endpointKeys = [...new Set(lineages.flatMap((lineage) => [lineage.packetKey, lineage.neighborPacketKey]))];
	if (endpointKeys.length > MAX_PACKET_INCIDENCE_ENDPOINTS_V1) throw new Error('PACKET_INCIDENCE_ENDPOINT_LIMIT_EXCEEDED');
	const { resolvePacketKeyResolutionV2 } = await import('../identity/packet-identity-resolver.js');
	const resolutions = await resolveIncidenceEndpointsV1(
		endpointKeys,
		async (keys) => {
			const result = await pool.query<AtlasPacketRowV1>(
				'SELECT packet_key, source_ref, source_revision, workspace_revision_key FROM atlas_packets WHERE packet_key = ANY($1::text[])',
				[keys],
			);
			assertPacketIncidenceWorkspaceRevisionV1(result.rows, snapshot.workspaceRevision);
			return result.rows;
		},
		async (key) => {
			try {
				const resolved = await resolvePacketKeyResolutionV2(key);
				return resolved.storagePacketKey === key ? resolved.canonicalPacketKey : null;
			} catch {
				return null;
			}
		},
	);
	const expected = expectedFromResolutionsV1(resolutions, snapshot.workspaceRevision, snapshot.graphRevision);
	for (const lineage of lineages) {
		const verdict = verifyPacketIncidenceLineageV1(lineage, expected);
		if (verdict.status !== 'LINEAGE_PROVEN') {
			throw new Error(`PACKET_INCIDENCE_LINEAGE_UNPROVEN:${lineage.lineageChecksum}:${verdict.failed.join(',')}`);
		}
	}
}
