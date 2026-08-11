import { buildFabricLaneManifest, type FabricLaneKind, type FabricLaneManifest } from '../contracts/fabric-lanes.js';

export interface BoardFabricLaneContext {
	workflowId: string;
	collection: string;
	taskId: string | null;
	taskLabel: string | null;
	recommendationId: string | null;
	sourceRef: string | null;
	treeNodeId: string | null;
}

export interface BoardFabricLaneManifestInput {
	context: BoardFabricLaneContext;
	packetKey: string;
	sourceRevision: string;
	representationRevision: string;
	producerId: string;
	producerRevision: string;
	laneKinds: FabricLaneKind[];
	evidenceRefs?: string[];
	featureRevision?: string | null;
	graphRevision?: string | null;
	telemetryRevision?: string | null;
	modelRevision?: string | null;
	toolPolicyRevision?: string | null;
	notes?: string | null;
}

export function buildBoardFabricLaneManifest(input: BoardFabricLaneManifestInput): FabricLaneManifest {
	const derivedNotes = [input.context.workflowId, input.context.taskLabel, input.context.treeNodeId].filter(Boolean).join(' | ');
	return buildFabricLaneManifest({
		packetKey: input.packetKey,
		sourceRef: input.context.sourceRef ?? input.context.collection,
		sourceRevision: input.sourceRevision,
		representationId: 'semantic_768',
		representationRevision: input.representationRevision,
		producerId: input.producerId,
		producerRevision: input.producerRevision,
		featureRevision: input.featureRevision ?? null,
		graphRevision: input.graphRevision ?? null,
		telemetryRevision: input.telemetryRevision ?? null,
		modelRevision: input.modelRevision ?? null,
		toolPolicyRevision: input.toolPolicyRevision ?? null,
		laneKinds: input.laneKinds,
		evidenceRefs: input.evidenceRefs ?? [],
		taskIds: input.context.taskId ? [input.context.taskId] : [],
		recommendationIds: input.context.recommendationId ? [input.context.recommendationId] : [],
		kanbanTaskBoard: input.context.collection,
		notes: input.notes ?? (derivedNotes.length > 0 ? derivedNotes : null),
	});
}
