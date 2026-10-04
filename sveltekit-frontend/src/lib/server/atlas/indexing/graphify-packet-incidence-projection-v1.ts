import { createHash } from 'node:crypto';
import { buildPacketIncidenceLineageV1, type PacketIncidenceLineageV1 } from '../lineage/packet-incidence-lineage-v1.js';
import type { EndpointResolutionV1 } from '../lineage/packet-incidence-endpoint-resolver-v1.js';
import {
	graphifyEdgeProjectionCandidateV1Schema,
	type GraphifyEdgeProjectionCandidateV1,
} from './graphify-symbol-projection-v1.js';

export type GraphifyPacketIncidenceProjectionInputV1 = {
	edge: GraphifyEdgeProjectionCandidateV1;
	packet: EndpointResolutionV1 & { graphEndpointKey: string; sourceRef: string; workspaceRevision: string; graphRevision: string };
	neighbor: EndpointResolutionV1 & { graphEndpointKey: string; sourceRef: string; workspaceRevision: string; graphRevision: string };
	graphRevision: string;
	producerRevision: string;
};

export const GRAPHIFY_PACKET_INCIDENCE_PROJECTION_REVISION_V1 = 'graphify-packet-incidence-projection-v1@1' as const;

function checksum(value: unknown): string {
	return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
	if (value && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
	}
	return JSON.stringify(value);
}

export function projectGraphifyEdgeToPacketIncidenceV1(
	input: GraphifyPacketIncidenceProjectionInputV1,
): PacketIncidenceLineageV1 {
	const edge = graphifyEdgeProjectionCandidateV1Schema.parse(input.edge);
	if (!edge.objectStableSymbolKey || edge.unresolvedTarget) {
		throw new Error(`GRAPHIFY_PACKET_INCIDENCE_TARGET_UNRESOLVED:${edge.referenceId}`);
	}
	if (edge.evidenceRefs.length === 0) {
		throw new Error(`GRAPHIFY_PACKET_INCIDENCE_EVIDENCE_REQUIRED:${edge.referenceId}`);
	}
	if (input.packet.status !== 'RESOLVED' || input.packet.canonicalId === null || input.packet.sourceRevision === null) {
		throw new Error(`GRAPHIFY_PACKET_INCIDENCE_SUBJECT_UNRESOLVED:${edge.referenceId}`);
	}
	if (input.neighbor.status !== 'RESOLVED' || input.neighbor.canonicalId === null || input.neighbor.sourceRevision === null) {
		throw new Error(`GRAPHIFY_PACKET_INCIDENCE_TARGET_PACKET_UNRESOLVED:${edge.referenceId}`);
	}
	if (input.packet.graphEndpointKey !== edge.subjectStableSymbolKey) {
		throw new Error(`GRAPHIFY_PACKET_INCIDENCE_SUBJECT_IDENTITY_MISMATCH:${edge.referenceId}`);
	}
	if (input.neighbor.graphEndpointKey !== edge.objectStableSymbolKey) {
		throw new Error(`GRAPHIFY_PACKET_INCIDENCE_TARGET_IDENTITY_MISMATCH:${edge.referenceId}`);
	}
	if (input.packet.sourceRef !== edge.sourceRef || input.packet.sourceRevision !== edge.sourceRevision) {
		throw new Error(`GRAPHIFY_PACKET_INCIDENCE_SOURCE_BINDING_MISMATCH:${edge.referenceId}`);
	}
	if (input.packet.workspaceRevision !== edge.workspaceRevision || input.neighbor.workspaceRevision !== edge.workspaceRevision) {
		throw new Error(`GRAPHIFY_PACKET_INCIDENCE_WORKSPACE_REVISION_MISMATCH:${edge.referenceId}`);
	}
	if (input.packet.graphRevision !== input.graphRevision || input.neighbor.graphRevision !== input.graphRevision) {
		throw new Error(`GRAPHIFY_PACKET_INCIDENCE_GRAPH_REVISION_MISMATCH:${edge.referenceId}`);
	}

	return buildPacketIncidenceLineageV1({
		packetKey: input.packet.packetKey,
		canonicalId: input.packet.canonicalId!,
		sourceRevision: input.packet.sourceRevision!,
		neighborPacketKey: input.neighbor.packetKey,
		neighborCanonicalId: input.neighbor.canonicalId!,
		neighborSourceRevision: input.neighbor.sourceRevision!,
		edgeType: edge.predicate,
		workspaceRevision: edge.workspaceRevision,
		graphRevision: input.graphRevision,
		producerId: 'graphify-packet-incidence-projection-v1',
		producerRevision: input.producerRevision,
		evidenceRefs: [
			...edge.evidenceRefs,
			`graph-edge:${edge.referenceId}`,
			`graph-edge-checksum:${checksum(edge)}`,
		],
	});
}
