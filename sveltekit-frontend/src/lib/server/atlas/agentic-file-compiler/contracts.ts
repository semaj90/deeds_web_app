import { createHash } from 'node:crypto';
import { z } from 'zod';

export const ATLAS_WORKFLOW_SCHEMA = 'atlas.workflow-spec.v1' as const;
export const ATLAS_WORKFLOW_ACTION_SCHEMA = 'atlas.workflow-action.v1' as const;
export const ATLAS_FILE_MUTATION_PLAN_SCHEMA = 'atlas.file-mutation-plan.v1' as const;
export const ATLAS_MASTRA_GRAPH_SCHEMA = 'atlas.mastra-workflow-graph.v1' as const;

export function stableJson(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
	const object = value as Record<string, unknown>;
	return `{${Object.keys(object)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
		.join(',')}}`;
}

export function sha256Stable(value: unknown): string {
	return createHash('sha256').update(stableJson(value)).digest('hex');
}

export const DagNodeKindSchema = z.enum([
	'CLASSIFY', 'RETRIEVE', 'RANK', 'EXACT_PROMOTE', 'COMPILE_CONTEXT', 'PREFILL',
	'MODEL', 'TOOL', 'MUTATE', 'VALIDATE', 'MATERIALIZE', 'APPROVAL',
	'CACHE_INVALIDATE', 'PROJECT', 'STOP',
]);

export const DagLaneSchema = z.enum([
	'planner', 'lexical', 'ast', 'semantic', 'graph', 'gpu', 'tool',
	'validator', 'materializer', 'acp', 'a2a',
]);

export const DagNodePlanSchema = z.object({
	nodeId: z.string().min(1),
	kind: DagNodeKindSchema,
	lane: DagLaneSchema.nullable().optional(),
	capability: z.string().min(1).nullable().optional(),
	inputRefs: z.array(z.string().min(1)).default([]),
	outputRefs: z.array(z.string().min(1)).default([]),
	dependsOn: z.array(z.string().min(1)).default([]),
	condition: z.record(z.string(), z.unknown()).nullable().optional(),
	resources: z.object({
		tokens: z.number().int().nonnegative().optional(),
		gpuBytes: z.number().int().nonnegative().optional(),
		hostBytes: z.number().int().nonnegative().optional(),
		timeoutMs: z.number().int().positive().optional(),
	}).default({}),
	retry: z.object({
		maxAttempts: z.number().int().positive().default(1),
		strategy: z.enum(['NONE', 'FIXED', 'EXPONENTIAL']).default('NONE'),
	}).default({ maxAttempts: 1, strategy: 'NONE' }),
	idempotencyKey: z.string().min(1),
	requiredEvidenceRefs: z.array(z.string().min(1)).default([]),
	checksum: z.string().min(1),
}).strict();
export type DagNodePlanV1 = z.infer<typeof DagNodePlanSchema>;

export const DagEdgeSchema = z.object({
	from: z.string().min(1),
	to: z.string().min(1),
	kind: z.enum(['SEQUENCE', 'PARALLEL', 'BRANCH']).default('SEQUENCE'),
}).strict();
export type DagEdgeV1 = z.infer<typeof DagEdgeSchema>;

export const AtlasWorkflowSpecSchema = z.object({
	schema: z.literal(ATLAS_WORKFLOW_SCHEMA),
	workflowId: z.string().min(1),
	workflowRevision: z.number().int().positive(),
	requestId: z.string().min(1),
	workspaceRevision: z.string().min(1),
	graphRevision: z.string().min(1).nullable().optional(),
	featureRevision: z.string().min(1).nullable().optional(),
	representationRevision: z.string().min(1),
	intentId: z.string().min(1),
	contextManifestId: z.string().min(1),
	promptPlanId: z.string().min(1).nullable().optional(),
	nodes: z.array(DagNodePlanSchema).min(1),
	edges: z.array(DagEdgeSchema).default([]),
	entryNodeIds: z.array(z.string().min(1)).min(1),
	terminalNodeIds: z.array(z.string().min(1)).min(1),
	resourceEnvelope: z.object({
		tokenBudget: z.number().int().positive(),
		candidateBudget: z.number().int().positive(),
		graphHopBudget: z.number().int().nonnegative(),
		hyperedgeExpansionBudget: z.number().int().nonnegative(),
		toolCallBudget: z.number().int().nonnegative(),
		gpuVramBudgetBytes: z.number().int().nonnegative().optional(),
		hostMemoryBudgetBytes: z.number().int().nonnegative().optional(),
		wallClockBudgetMs: z.number().int().positive().optional(),
	}),
	retryPolicyRevision: z.string().min(1),
	authorizationPolicyRevision: z.string().min(1),
	validationPolicyRevision: z.string().min(1),
	checksum: z.string().min(1),
}).strict();
export type AtlasWorkflowSpecV1 = z.infer<typeof AtlasWorkflowSpecSchema>;

export const WorkflowActionEventSchema = z.object({
	schema: z.literal(ATLAS_WORKFLOW_ACTION_SCHEMA),
	workflowId: z.string().min(1),
	workflowRevision: z.number().int().positive(),
	runId: z.string().min(1),
	sequence: z.number().int().nonnegative(),
	actionId: z.string().min(1),
	parentActionId: z.string().min(1).nullable().optional(),
	dagNodeId: z.string().min(1),
	attempt: z.number().int().positive(),
	lane: DagLaneSchema,
	transport: z.enum(['local', 'grpc', 'rabbitmq', 'acp', 'a2a']).nullable().optional(),
	executor: z.object({
		family: z.enum(['local', 'mastra', 'temporal', 'grpc-worker', 'gpu-worker']),
		runtimeId: z.string().min(1).optional(),
		runtimeRevision: z.string().min(1).optional(),
	}).nullable().optional(),
	kind: z.enum([
		'scheduled', 'started', 'progress', 'artifact', 'blocked', 'suspended',
		'resumed', 'retrying', 'validated', 'materialized', 'completed', 'failed', 'cancelled',
	]),
	revisions: z.object({
		workspace: z.string().min(1),
		graph: z.string().min(1).optional(),
		feature: z.string().min(1).optional(),
		representation: z.string().min(1).optional(),
	}),
	inputRefs: z.array(z.string().min(1)).default([]),
	outputRefs: z.array(z.string().min(1)).default([]),
	evidenceRefs: z.array(z.string().min(1)).default([]),
	errorRef: z.string().min(1).nullable().optional(),
	emittedAt: z.string().datetime(),
	producerRevision: z.string().min(1),
	checksum: z.string().min(1),
}).strict();
export type WorkflowActionEventV1 = z.infer<typeof WorkflowActionEventSchema>;

export const FileMutationPlanSchema = z.object({
	schema: z.literal(ATLAS_FILE_MUTATION_PLAN_SCHEMA),
	mutationId: z.string().min(1),
	requestId: z.string().min(1),
	workflowId: z.string().min(1),
	dagNodeId: z.string().min(1),
	workspaceRevision: z.string().min(1),
	operation: z.enum(['CREATE', 'PATCH', 'RENAME', 'DELETE']),
	targetPath: z.string().min(1),
	destinationPath: z.string().min(1).nullable().optional(),
	targetArtifactKind: z.string().min(1),
	requiredSymbols: z.array(z.string().min(1)).default([]),
	contextManifestId: z.string().min(1),
	packetKeys: z.array(z.string().min(1)).default([]),
	sourceRefs: z.array(z.string().min(1)).default([]),
	promotedEvidenceIds: z.array(z.string().min(1)).default([]),
	expectedAbsent: z.boolean().nullable().optional(),
	expectedExistingChecksum: z.string().min(1).nullable().optional(),
	allowedRoots: z.array(z.string().min(1)).min(1),
	forbiddenRoots: z.array(z.string().min(1)).default([]),
	contentRef: z.string().min(1).nullable().optional(),
	validationNodeIds: z.array(z.string().min(1)).min(1),
	planChecksum: z.string().min(1),
}).strict();
export type FileMutationPlanV1 = z.infer<typeof FileMutationPlanSchema>;

export function withChecksum<T extends Record<string, unknown>>(value: T, field: string = 'checksum'): T & Record<string, string> {
	const clone: Record<string, unknown> = { ...value };
	delete clone[field];
	return { ...value, [field]: sha256Stable(clone) } as T & Record<string, string>;
}
