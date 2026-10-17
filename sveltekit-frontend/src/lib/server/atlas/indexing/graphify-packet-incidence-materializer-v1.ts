import { createHash } from 'node:crypto';
import { verifyGraphRevisionSnapshotV1, type GraphRevisionSnapshotV1 } from '../lineage/graph-revision-snapshot-v1.js';
import type { PacketIncidenceLineageV1 } from '../lineage/packet-incidence-lineage-v1.js';
import type { GraphSnapshotGraphifyPacketEdgeCandidateV1 } from '../graph/graph-snapshot-materializer.js';
import type { GraphifyEdgeProjectionCandidateV1, GraphifySymbolProjectionCandidateV1 } from './graphify-symbol-projection-v1.js';
import type { GraphifyStructuralProjectionPipelineV1 } from './graphify-structural-projection-pipeline-v1.js';
import {
	deriveGraphifyEdgeReplayVerdictV1,
	planGraphifyEdgeReplayV1,
	type GraphifyEdgeReplayContextV1,
} from './graphify-edge-replay-identity-v1.js';
import {
	MAX_PACKETS_PER_GRAPHIFY_SYMBOL_V1,
	resolveGraphifyPacketIncidenceEndpointsV1,
	type GraphifyPacketIncidenceQueryV1,
} from './graphify-packet-incidence-endpoint-resolver-v1.js';
import {
	GRAPHIFY_PACKET_INCIDENCE_PROJECTION_REVISION_V1,
	projectGraphifyEdgeToPacketIncidenceV1,
} from './graphify-packet-incidence-projection-v1.js';

export async function materializeGraphifyPacketIncidenceCandidateV1(
	edge: GraphifyEdgeProjectionCandidateV1,
	snapshot: GraphRevisionSnapshotV1,
	source?: GraphifyPacketIncidenceQueryV1,
) {
	const endpoints = await resolveGraphifyPacketIncidenceEndpointsV1(edge, snapshot, source);
	if (endpoints.packets.length * endpoints.neighbors.length > MAX_PACKETS_PER_GRAPHIFY_SYMBOL_V1 ** 2) {
		throw new Error('GRAPHIFY_PACKET_INCIDENCE_PAIR_LIMIT_EXCEEDED');
	}
	const projections: PacketIncidenceLineageV1[] = [];
	for (const packet of endpoints.packets) {
		for (const neighbor of endpoints.neighbors) {
			if (packet.packetKey === neighbor.packetKey) continue;
			projections.push(projectGraphifyEdgeToPacketIncidenceV1({
				edge,
				packet,
				neighbor,
				graphRevision: snapshot.graphRevision,
				producerRevision: GRAPHIFY_PACKET_INCIDENCE_PROJECTION_REVISION_V1,
			}));
		}
	}
	return projections;
}

export interface GraphifyPacketEdgeSourceBatchV1 {
	edge: GraphifyEdgeProjectionCandidateV1;
	subjectSymbol: GraphifySymbolProjectionCandidateV1;
	targetSymbol: GraphifySymbolProjectionCandidateV1;
	sourceBytes: Uint8Array;
	targetSourceBytes: Uint8Array;
}

export function buildGraphifyPacketEdgeSourceBatchesV1(input: {
	pipelines: readonly GraphifyStructuralProjectionPipelineV1[];
	sourceBytesBySourceRef: ReadonlyMap<string, Uint8Array>;
}): {
	batches: GraphifyPacketEdgeSourceBatchV1[];
	rejected: { referenceId: string; reason: string }[];
	checksum: string;
	canonicalAuthority: false;
	writesPerformed: false;
} {
	const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
	const normalize = (value: string) => value.trim().replaceAll('\\', '/').replace(/^\.\//, '');
	const sourceBytesBySourceRef = new Map<string, Uint8Array>();
	for (const [sourceRef, bytes] of input.sourceBytesBySourceRef) {
		const normalizedSourceRef = normalize(sourceRef);
		if (sourceBytesBySourceRef.has(normalizedSourceRef)) throw new Error(`GRAPHIFY_PACKET_BATCH_DUPLICATE_SOURCE_BYTES:${normalizedSourceRef}`);
		sourceBytesBySourceRef.set(normalizedSourceRef, bytes);
	}
	const pipelineBySourceRef = new Map<string, GraphifyStructuralProjectionPipelineV1>();
	for (const pipeline of input.pipelines) {
		const sourceRef = normalize(pipeline.sourceRef);
		if (pipelineBySourceRef.has(sourceRef)) throw new Error(`GRAPHIFY_PACKET_BATCH_DUPLICATE_PIPELINE_SOURCE:${sourceRef}`);
		pipelineBySourceRef.set(sourceRef, pipeline);
	}
	const symbolOwners = new Map<string, GraphifySymbolProjectionCandidateV1[]>();
	for (const pipeline of input.pipelines) {
		if (pipeline.status !== 'MAPPED' || !pipeline.batch) continue;
		for (const symbol of pipeline.batch.symbols) {
			const key = `${symbol.stableSymbolKey}\u0000${normalize(symbol.sourceRef)}\u0000${symbol.sourceRevision}\u0000${symbol.workspaceRevision}`;
			symbolOwners.set(key, [...(symbolOwners.get(key) ?? []), symbol]);
		}
	}
	const batches: GraphifyPacketEdgeSourceBatchV1[] = [];
	const rejected: { referenceId: string; reason: string }[] = [];
	for (const pipeline of [...input.pipelines].sort((left, right) => normalize(left.sourceRef).localeCompare(normalize(right.sourceRef)))) {
		if (pipeline.status !== 'MAPPED' || !pipeline.batch) continue;
		const sourceRef = normalize(pipeline.sourceRef);
		const sourceBytes = sourceBytesBySourceRef.get(sourceRef);
		if (!sourceBytes || `sha256:${hash(sourceBytes)}` !== pipeline.sourceRevision
			|| pipeline.batch.sourceRef !== pipeline.sourceRef
			|| pipeline.batch.sourceRevision !== pipeline.sourceRevision
			|| pipeline.batch.workspaceRevision !== pipeline.workspaceRevision) {
			for (const edge of pipeline.batch.edges) rejected.push({ referenceId: edge.referenceId, reason: 'SOURCE_PIPELINE_BYTES_OR_BINDING_MISMATCH' });
			continue;
		}
		for (const edge of [...pipeline.batch.edges].sort((left, right) => left.referenceId.localeCompare(right.referenceId))) {
			if (normalize(edge.sourceRef) !== sourceRef || edge.sourceRevision !== pipeline.sourceRevision
				|| edge.workspaceRevision !== pipeline.workspaceRevision) {
				rejected.push({ referenceId: edge.referenceId, reason: 'EDGE_SOURCE_PIPELINE_BINDING_MISMATCH' });
				continue;
			}
			const subjectMatches = pipeline.batch.symbols.filter((symbol) => symbol.stableSymbolKey === edge.subjectStableSymbolKey
				&& normalize(symbol.sourceRef) === normalize(edge.sourceRef)
				&& symbol.sourceRevision === edge.sourceRevision
				&& symbol.workspaceRevision === edge.workspaceRevision);
			if (subjectMatches.length !== 1) {
				rejected.push({ referenceId: edge.referenceId, reason: subjectMatches.length ? 'SUBJECT_SYMBOL_AMBIGUOUS' : 'SUBJECT_SYMBOL_MISSING' });
				continue;
			}
			if (!edge.objectStableSymbolKey || !edge.objectSourceRef || !edge.objectSourceRevision || edge.unresolvedTarget) {
				rejected.push({ referenceId: edge.referenceId, reason: 'TARGET_SYMBOL_UNRESOLVED' });
				continue;
			}
			const targetRef = normalize(edge.objectSourceRef);
			const targetPipeline = pipelineBySourceRef.get(targetRef);
			const targetBytes = sourceBytesBySourceRef.get(targetRef);
			if (!targetPipeline || targetPipeline.status !== 'MAPPED' || !targetPipeline.batch || !targetBytes
				|| `sha256:${hash(targetBytes)}` !== edge.objectSourceRevision
				|| targetPipeline.sourceRevision !== edge.objectSourceRevision
				|| targetPipeline.workspaceRevision !== edge.workspaceRevision
				|| normalize(targetPipeline.batch.sourceRef) !== targetRef
				|| targetPipeline.batch.sourceRevision !== edge.objectSourceRevision
				|| targetPipeline.batch.workspaceRevision !== edge.workspaceRevision) {
				rejected.push({ referenceId: edge.referenceId, reason: 'TARGET_SOURCE_PIPELINE_UNAVAILABLE_OR_MISMATCHED' });
				continue;
			}
			const targetKey = `${edge.objectStableSymbolKey}\u0000${targetRef}\u0000${edge.objectSourceRevision}\u0000${edge.workspaceRevision}`;
			const targetMatches = symbolOwners.get(targetKey) ?? [];
			if (targetMatches.length !== 1) {
				rejected.push({ referenceId: edge.referenceId, reason: targetMatches.length ? 'TARGET_SYMBOL_AMBIGUOUS' : 'TARGET_SYMBOL_MISSING' });
				continue;
			}
			batches.push({
				edge,
				subjectSymbol: subjectMatches[0]!,
				targetSymbol: targetMatches[0]!,
				sourceBytes,
				targetSourceBytes: targetBytes
			});
		}
	}
	const orderedBatches = batches.sort((left, right) => left.edge.referenceId.localeCompare(right.edge.referenceId));
	const orderedRejected = rejected.sort((left, right) => left.referenceId.localeCompare(right.referenceId) || left.reason.localeCompare(right.reason));
	return {
		batches: orderedBatches,
		rejected: orderedRejected,
		checksum: hash(JSON.stringify({
			pipelines: input.pipelines.map((pipeline) => ({ sourceRef: normalize(pipeline.sourceRef), sourceRevision: pipeline.sourceRevision, workspaceRevision: pipeline.workspaceRevision, checksum: pipeline.checksum })).sort((left, right) => left.sourceRef.localeCompare(right.sourceRef)),
			sourceByteDigests: [...sourceBytesBySourceRef.entries()].map(([sourceRef, bytes]) => ({ sourceRef, sha256: hash(bytes) })).sort((left, right) => left.sourceRef.localeCompare(right.sourceRef)),
			admitted: orderedBatches.map((batch) => batch.edge.referenceId),
			rejected: orderedRejected
		})),
		canonicalAuthority: false,
		writesPerformed: false
	};
}

export async function resolveGraphifyPacketEdgesForSnapshotV1(input: {
	batches: readonly GraphifyPacketEdgeSourceBatchV1[];
	snapshot: GraphRevisionSnapshotV1;
	replayContext: GraphifyEdgeReplayContextV1;
	source?: GraphifyPacketIncidenceQueryV1;
}): Promise<{
	candidates: GraphSnapshotGraphifyPacketEdgeCandidateV1[];
	replayPlanChecksum: string;
	replayCounts: ReturnType<typeof planGraphifyEdgeReplayV1>['counts'];
	rejectedReferenceIds: { referenceId: string; admission: string }[];
}> {
	if (!verifyGraphRevisionSnapshotV1(input.snapshot)) throw new Error('GRAPHIFY_PACKET_MATERIALIZATION_SNAPSHOT_INVALID');
	if (!/^sha256:[a-f0-9]{64}$/i.test(input.snapshot.workspaceRevisionKey)
		|| !/^(?:sha256:)?[a-f0-9]{64}$/i.test(input.snapshot.graphRevision)) {
		throw new Error('GRAPHIFY_PACKET_MATERIALIZATION_SNAPSHOT_REVISION_SHAPE_INVALID');
	}
	if (input.replayContext.workspaceRevisionKey !== input.snapshot.workspaceRevisionKey
		|| input.replayContext.graphRevision !== input.snapshot.graphRevision) {
		throw new Error('GRAPHIFY_PACKET_MATERIALIZATION_REPLAY_SNAPSHOT_MISMATCH');
	}
	const plan = planGraphifyEdgeReplayV1(input.batches.map((batch) => batch.edge), input.replayContext);
	const admittedKeys = new Set(plan.admitted.map((item) => item.edgeKey));
	const candidates: GraphSnapshotGraphifyPacketEdgeCandidateV1[] = [];
	for (const batch of [...input.batches].sort((left, right) => left.edge.referenceId.localeCompare(right.edge.referenceId))) {
		const verdict = deriveGraphifyEdgeReplayVerdictV1(batch.edge, input.replayContext);
		if (verdict.admission !== 'ADMITTED' || !verdict.edgeKey || !admittedKeys.has(verdict.edgeKey)) continue;
		if (batch.subjectSymbol.stableSymbolKey !== batch.edge.subjectStableSymbolKey
			|| batch.targetSymbol.stableSymbolKey !== batch.edge.objectStableSymbolKey
			|| batch.subjectSymbol.sourceRef !== batch.edge.sourceRef
			|| batch.subjectSymbol.sourceRevision !== batch.edge.sourceRevision
			|| batch.subjectSymbol.workspaceRevision !== input.snapshot.workspaceRevisionKey
			|| batch.targetSymbol.sourceRef !== batch.edge.objectSourceRef
			|| batch.targetSymbol.sourceRevision !== verdict.targetSourceRevision
			|| batch.targetSymbol.workspaceRevision !== input.snapshot.workspaceRevisionKey) {
			throw new Error(`GRAPHIFY_PACKET_MATERIALIZATION_SYMBOL_BINDING_MISMATCH:${batch.edge.referenceId}`);
		}
		const incidences = await materializeGraphifyPacketIncidenceCandidateV1(batch.edge, input.snapshot, input.source);
		for (const incidence of incidences) {
			if (incidence.sourceRevision !== batch.subjectSymbol.sourceRevision
				|| incidence.neighborSourceRevision !== batch.targetSymbol.sourceRevision
				|| incidence.workspaceRevision !== input.snapshot.workspaceRevisionKey
				|| incidence.graphRevision !== input.snapshot.graphRevision) {
				throw new Error(`GRAPHIFY_PACKET_MATERIALIZATION_INCIDENCE_BINDING_MISMATCH:${batch.edge.referenceId}`);
			}
			candidates.push({
				edge: batch.edge,
				subjectSymbol: batch.subjectSymbol,
				targetSymbol: batch.targetSymbol,
				sourcePacketKey: incidence.packetKey,
				targetPacketKey: incidence.neighborPacketKey,
				sourceSymbolKey: batch.edge.subjectStableSymbolKey,
				targetSymbolKey: batch.edge.objectStableSymbolKey!,
				graphRevision: input.snapshot.graphRevision.replace(/^sha256:/, ''),
				sourceBytes: batch.sourceBytes,
				targetSourceBytes: batch.targetSourceBytes
			});
		}
	}
	return {
		candidates,
		replayPlanChecksum: plan.planChecksum,
		replayCounts: plan.counts,
		rejectedReferenceIds: plan.rejected.map(({ edge, admission }) => ({ referenceId: edge.referenceId, admission }))
	};
}
