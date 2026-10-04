import type { GraphRevisionSnapshotV1 } from '../lineage/graph-revision-snapshot-v1.js';
import type { GraphifyEdgeProjectionCandidateV1 } from './graphify-symbol-projection-v1.js';
import { resolveGraphifyPacketIncidenceEndpointsV1 } from './graphify-packet-incidence-endpoint-resolver-v1.js';
import {
	GRAPHIFY_PACKET_INCIDENCE_PROJECTION_REVISION_V1,
	projectGraphifyEdgeToPacketIncidenceV1,
} from './graphify-packet-incidence-projection-v1.js';

export async function materializeGraphifyPacketIncidenceCandidateV1(
	edge: GraphifyEdgeProjectionCandidateV1,
	snapshot: GraphRevisionSnapshotV1,
) {
	const endpoints = await resolveGraphifyPacketIncidenceEndpointsV1(edge, snapshot);
	return projectGraphifyEdgeToPacketIncidenceV1({
		edge,
		...endpoints,
		graphRevision: snapshot.graphRevision,
		producerRevision: GRAPHIFY_PACKET_INCIDENCE_PROJECTION_REVISION_V1,
	});
}
