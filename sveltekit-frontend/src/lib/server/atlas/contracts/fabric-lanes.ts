import { z } from 'zod';

export const FabricLaneKindSchema = z.enum([
	'gnn_graph_evidence',
	'exact_knn_retrieval',
	'kmeans_routing_hint',
	'ewin_tang_low_rank',
	'hyperloglog_telemetry',
	'kanban_task_board',
	'recommendation_policy',
]);

export type FabricLaneKind = z.infer<typeof FabricLaneKindSchema>;

const RevisionStringSchema = z.string().min(1);

const UniqueStringArraySchema = z.array(z.string().min(1)).default([]);

export const FabricLaneManifestSchema = z
	.object({
		packetKey: z.string().min(1),
		sourceRef: z.string().min(1),
		sourceRevision: RevisionStringSchema,
		representationId: z.literal('semantic_768'),
		representationRevision: RevisionStringSchema,
		producerId: z.string().min(1),
		producerRevision: RevisionStringSchema,
		featureRevision: z.string().min(1).nullable().optional(),
		graphRevision: z.string().min(1).nullable().optional(),
		telemetryRevision: z.string().min(1).nullable().optional(),
		modelRevision: z.string().min(1).nullable().optional(),
		toolPolicyRevision: z.string().min(1).nullable().optional(),
		laneKinds: z.array(FabricLaneKindSchema).min(1).max(16),
		evidenceRefs: UniqueStringArraySchema,
		taskIds: UniqueStringArraySchema,
		recommendationIds: UniqueStringArraySchema,
		kanbanTaskBoard: z.string().min(1).nullable().optional(),
		notes: z.string().min(1).nullable().optional(),
	})
	.strict();

export type FabricLaneManifest = z.infer<typeof FabricLaneManifestSchema>;

function uniqueSorted(values: readonly string[]): string[] {
	return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

export function buildFabricLaneManifest(input: FabricLaneManifest): FabricLaneManifest {
	return FabricLaneManifestSchema.parse({
		...input,
		laneKinds: uniqueSorted(input.laneKinds).map((lane) => lane as FabricLaneKind),
		evidenceRefs: uniqueSorted(input.evidenceRefs),
		taskIds: uniqueSorted(input.taskIds),
		recommendationIds: uniqueSorted(input.recommendationIds),
	});
}
