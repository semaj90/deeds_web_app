import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ATLAS_CANONICAL_SEMANTIC_REPRESENTATION as SEMANTIC_REPRESENTATION_ID } from '../retrieval/qdrant-semantic-projection.js';

export const GraphifyTaskCandidatePrioritySchema = z.enum(['P0', 'P1', 'P2', 'P3']);

export const GraphifyTaskCandidateKindSchema = z.enum(['graphify_evidence', 'recommendation_review']);

export const GraphifyTaskCandidateSchema = z
	.object({
		task_id: z.string().min(1),
		producer_id: z.string().min(1),
		producer_revision: z.string().min(1),
		workspace_revision: z.string().min(1),
		source_revision: z.string().min(1),
		graph_revision: z.string().min(1).nullable().optional(),
		representation_id: z.literal(SEMANTIC_REPRESENTATION_ID),
		representation_revision: z.string().min(1),
		kind: GraphifyTaskCandidateKindSchema,
		priority: GraphifyTaskCandidatePrioritySchema,
		confidence: z.number().min(0).max(1).nullable().optional(),
		packet_keys: z.array(z.string().min(1)).default([]),
		feature_ids: z.array(z.string().min(1)).default([]),
		symbols: z.array(z.string().min(1)).default([]),
		files: z.array(z.string().min(1)).default([]),
		evidence_refs: z.array(z.string().min(1)).default([]),
		required_gates: z.array(z.string().min(1)).default([]),
		blocked_by: z.array(z.string().min(1)).default([]),
		source_ref: z.string().min(1).nullable().optional(),
		source_refs: z.array(z.string().min(1)).default([]),
		tree_node_id: z.string().min(1).nullable().optional(),
		title_id: z.string().min(1).nullable().optional(),
		task_label: z.string().min(1).nullable().optional(),
		script: z.string().min(1).nullable().optional(),
		dedup_key: z.string().min(1),
		generated_at: z.string().datetime(),
		notes: z.string().min(1).nullable().optional(),
	})
	.strict();

export type GraphifyTaskCandidatePriority = z.infer<typeof GraphifyTaskCandidatePrioritySchema>;
export type GraphifyTaskCandidateKind = z.infer<typeof GraphifyTaskCandidateKindSchema>;
export type GraphifyTaskCandidate = z.infer<typeof GraphifyTaskCandidateSchema>;

export interface GraphifyTaskCandidateInput {
	taskId: string;
	priority: GraphifyTaskCandidatePriority;
	taskLabel: string;
	kind: GraphifyTaskCandidateKind;
	producerId: string;
	producerRevision: string;
	workspaceRevision: string;
	sourceRevision: string;
	graphRevision?: string | null;
	representationRevision: string;
	confidence?: number | null;
	packetKeys?: string[];
	featureIds?: string[];
	symbols?: string[];
	files?: string[];
	evidenceRefs?: string[];
	requiredGates?: string[];
	blockedBy?: string[];
	sourceRef?: string | null;
	sourceRefs?: string[];
	treeNodeId?: string | null;
	titleId?: string | null;
	script?: string | null;
	notes?: string | null;
	generatedAt?: string;
}

function uniq(values: Array<string | null | undefined>): string[] {
	return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)))
		.sort((a, b) => a.localeCompare(b));
}

function buildDedupKey(input: GraphifyTaskCandidateInput): string {
	return createHash('sha256')
		.update(JSON.stringify({
			taskId: input.taskId,
			priority: input.priority,
			kind: input.kind,
			producerId: input.producerId,
			producerRevision: input.producerRevision,
			workspaceRevision: input.workspaceRevision,
			sourceRevision: input.sourceRevision,
			graphRevision: input.graphRevision ?? null,
			representationRevision: input.representationRevision,
			packetKeys: uniq(input.packetKeys ?? []),
			featureIds: uniq(input.featureIds ?? []),
			symbols: uniq(input.symbols ?? []),
			files: uniq(input.files ?? []),
			evidenceRefs: uniq(input.evidenceRefs ?? []),
			requiredGates: uniq(input.requiredGates ?? []),
			blockedBy: uniq(input.blockedBy ?? []),
			sourceRef: input.sourceRef ?? null,
			sourceRefs: uniq(input.sourceRefs ?? []),
			treeNodeId: input.treeNodeId ?? null,
			titleId: input.titleId ?? null,
			script: input.script ?? null,
			notes: input.notes ?? null,
		}))
		.digest('hex');
}

export function buildGraphifyTaskCandidate(input: GraphifyTaskCandidateInput): GraphifyTaskCandidate {
	return GraphifyTaskCandidateSchema.parse({
		task_id: input.taskId,
		producer_id: input.producerId,
		producer_revision: input.producerRevision,
		workspace_revision: input.workspaceRevision,
		source_revision: input.sourceRevision,
		graph_revision: input.graphRevision ?? null,
		representation_id: SEMANTIC_REPRESENTATION_ID,
		representation_revision: input.representationRevision,
		kind: input.kind,
		priority: input.priority,
		confidence: input.confidence ?? null,
		packet_keys: uniq(input.packetKeys ?? []),
		feature_ids: uniq(input.featureIds ?? []),
		symbols: uniq(input.symbols ?? []),
		files: uniq(input.files ?? []),
		evidence_refs: uniq(input.evidenceRefs ?? []),
		required_gates: uniq(input.requiredGates ?? []),
		blocked_by: uniq(input.blockedBy ?? []),
		source_ref: input.sourceRef ?? null,
		source_refs: uniq(input.sourceRefs ?? []),
		tree_node_id: input.treeNodeId ?? null,
		title_id: input.titleId ?? null,
		task_label: input.taskLabel,
		script: input.script ?? null,
		dedup_key: buildDedupKey(input),
		generated_at: input.generatedAt ?? new Date().toISOString(),
		notes: input.notes ?? null,
	});
}
