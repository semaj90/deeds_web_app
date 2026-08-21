import { z } from 'zod';
import { canonicalPacketHash, sortedUnique } from './canonical-packet-hash.js';
import { DagLaneSchema, DagNodeKindSchema } from './contracts.js';

export const ATLAS_ARTIFACT_REF_SCHEMA = 'atlas.artifact-ref.v1' as const;
export const ATLAS_SMART_PACKET_SCHEMA = 'atlas.smart-rpc.v1' as const;
export const ATLAS_WORKFLOW_PLAN_SCHEMA = 'atlas.workflow-plan.v1' as const;
export const ATLAS_WORKFLOW_ACTION_SCHEMA_V1 = 'atlas.workflow-action-contract.v1' as const;
export const ATLAS_ACTION_ATTEMPT_SCHEMA = 'atlas.action-attempt.v1' as const;
export const ATLAS_ACTION_RECEIPT_SCHEMA = 'atlas.action-receipt.v1' as const;
export const ATLAS_PREFILL_RECEIPT_SCHEMA = 'atlas.prefill-receipt.v1' as const;

export const RevisionFenceSchema = z.object({
	workspaceRevision: z.string().min(1),
	sourceRevision: z.string().min(1).optional(),
	graphRevision: z.string().min(1).optional(),
	representationRevision: z.string().min(1).optional(),
	featureRevision: z.string().min(1).optional(),
}).strict();
export type RevisionFenceV1 = z.infer<typeof RevisionFenceSchema>;

export const ArtifactLocationSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('arrow'), snapshotId: z.string().min(1), ordinal: z.number().int().nonnegative() }).strict(),
	z.object({ type: z.literal('cuda'), tileId: z.string().min(1), byteOffset: z.number().int().nonnegative().optional() }).strict(),
	z.object({ type: z.literal('postgres'), key: z.string().min(1) }).strict(),
	z.object({ type: z.literal('qdrant'), collection: z.string().min(1), pointId: z.string().min(1) }).strict(),
	z.object({ type: z.literal('neo4j'), elementId: z.string().min(1) }).strict(),
	z.object({ type: z.literal('object'), uri: z.string().min(1) }).strict(),
]);

export const ArtifactRefSchema = z.object({
	schema: z.literal(ATLAS_ARTIFACT_REF_SCHEMA),
	artifactId: z.string().min(1),
	canonicalId: z.string().min(1).optional(),
	kind: z.enum([
		'source-span', 'ast-node', 'semantic-row', 'feature-row', 'graph-node',
		'hypergraph-frontier', 'tensor-tile', 'context-manifest', 'prompt-plan',
		'prefill-artifact', 'model-output', 'tool-output', 'receipt',
	]),
	revisions: RevisionFenceSchema,
	checksum: z.string().min(1),
	location: ArtifactLocationSchema,
}).strict();
export type ArtifactRefV1 = z.infer<typeof ArtifactRefSchema>;

export const StructuralCoordinateSchema = z.object({
	symbolVersionId: z.string().min(1).optional(),
	treeNodeId: z.string().min(1).optional(),
	nodeType: z.string().min(1).optional(),
	astPath: z.array(z.number().int().nonnegative()).optional(),
	parentAstPath: z.array(z.number().int().nonnegative()).optional(),
	sourceRef: z.string().min(1),
	startByte: z.number().int().nonnegative().optional(),
	endByte: z.number().int().nonnegative().optional(),
}).strict().superRefine((value, ctx) => {
	if (value.startByte !== undefined && value.endByte !== undefined && value.endByte < value.startByte) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'endByte must be >= startByte' });
	}
});

export const OrdinalCoordinatesSchema = z.object({
	semanticOrdinal: z.number().int().nonnegative().optional(),
	graphOrdinal: z.number().int().nonnegative().optional(),
	featureOrdinal: z.number().int().nonnegative().optional(),
	tensorRowOrdinal: z.number().int().nonnegative().optional(),
}).strict();

export const GpuTensorArtifactSchema = z.object({
	tileId: z.string().min(1),
	dtype: z.enum(['fp16', 'bf16', 'fp32', 'int8', 'uint8', 'int32', 'uint32']),
	shape: z.array(z.number().int().nonnegative()).min(1),
	strides: z.array(z.number().int().nonnegative()).optional(),
	byteOffset: z.number().int().nonnegative().default(0),
	byteLength: z.number().int().nonnegative(),
	checksum: z.string().min(1),
	residency: z.enum(['disk', 'mmap', 'pinned-host', 'cuda']),
	cudaIpcLeaseRef: z.string().min(1).optional(),
}).strict().superRefine((value, ctx) => {
	if (value.strides && value.strides.length !== value.shape.length) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'strides length must match shape rank' });
	}
	if (value.cudaIpcLeaseRef && value.residency !== 'cuda') {
		ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'CUDA IPC lease requires cuda residency' });
	}
});
export type GpuTensorArtifactV1 = z.infer<typeof GpuTensorArtifactSchema>;

export const SmartRpcPacketSchema = z.object({
	schema: z.literal(ATLAS_SMART_PACKET_SCHEMA),
	packetId: z.string().min(1),
	packetKey: z.string().min(1),
	canonicalId: z.string().min(1),
	revisions: RevisionFenceSchema,
	structural: StructuralCoordinateSchema,
	ordinals: OrdinalCoordinatesSchema.default({}),
	semanticRef: ArtifactRefSchema.optional(),
	graphRef: ArtifactRefSchema.optional(),
	featureRef: ArtifactRefSchema.optional(),
	tensor: GpuTensorArtifactSchema.optional(),
	evidenceRefs: z.array(z.string().min(1)).default([]),
	instructionRef: z.string().min(1).optional(),
	execution: z.object({
		workflowId: z.string().min(1),
		workflowRevision: z.number().int().positive(),
		runId: z.string().min(1),
		dagNodeId: z.string().min(1),
		actionId: z.string().min(1),
		attempt: z.number().int().positive(),
	}).strict().optional(),
	producerRevision: z.string().min(1),
	contentChecksum: z.string().min(1),
}).strict();
export type SmartRpcPacketV1 = z.infer<typeof SmartRpcPacketSchema>;

export const WorkflowBudgetSchema = z.object({
	maxVramBytes: z.number().int().nonnegative().optional(),
	maxHostBytes: z.number().int().nonnegative().optional(),
	maxTokens: z.number().int().nonnegative().optional(),
	maxCandidates: z.number().int().nonnegative().optional(),
	maxGraphHops: z.number().int().nonnegative().optional(),
	maxHyperedges: z.number().int().nonnegative().optional(),
	maxToolCalls: z.number().int().nonnegative().optional(),
	deadlineMs: z.number().int().positive().optional(),
}).strict();

export const WorkflowActionSchema = z.object({
	schema: z.literal(ATLAS_WORKFLOW_ACTION_SCHEMA_V1),
	actionId: z.string().min(1),
	workflowId: z.string().min(1),
	workflowRevision: z.number().int().positive(),
	runId: z.string().min(1),
	dagNodeId: z.string().min(1),
	sequence: z.number().int().nonnegative(),
	kind: DagNodeKindSchema,
	lane: DagLaneSchema,
	inputArtifacts: z.array(ArtifactRefSchema).default([]),
	expectedOutputKinds: z.array(ArtifactRefSchema.shape.kind).default([]),
	dependencies: z.array(z.string().min(1)).default([]),
	budget: WorkflowBudgetSchema.default({}),
	executor: z.object({
		class: z.enum(['cpu', 'gpu', 'database', 'tool', 'model', 'agent']),
		capability: z.string().min(1),
	}).strict(),
	idempotencyKey: z.string().min(1),
	revisions: RevisionFenceSchema,
	checksum: z.string().min(1),
}).strict();
export type WorkflowActionV1 = z.infer<typeof WorkflowActionSchema>;

export const WorkflowPlanSchema = z.object({
	schema: z.literal(ATLAS_WORKFLOW_PLAN_SCHEMA),
	workflowId: z.string().min(1),
	workflowRevision: z.number().int().positive(),
	runId: z.string().min(1),
	requestId: z.string().min(1),
	contextManifestId: z.string().min(1),
	promptPlanId: z.string().min(1).optional(),
	revisions: RevisionFenceSchema,
	actions: z.array(WorkflowActionSchema).min(1),
	entryActionIds: z.array(z.string().min(1)).min(1),
	terminalActionIds: z.array(z.string().min(1)).min(1),
	planChecksum: z.string().min(1),
}).strict().superRefine((plan, ctx) => {
	const ids = new Set(plan.actions.map((action) => action.actionId));
	for (const id of [...plan.entryActionIds, ...plan.terminalActionIds]) {
		if (!ids.has(id)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `unknown action id ${id}` });
	}
	for (const action of plan.actions) {
		for (const dependency of action.dependencies) {
			if (!ids.has(dependency)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `unknown dependency ${dependency}` });
		}
	}
});
export type WorkflowPlanV1 = z.infer<typeof WorkflowPlanSchema>;

export const ActionAttemptSchema = z.object({
	schema: z.literal(ATLAS_ACTION_ATTEMPT_SCHEMA),
	attemptId: z.string().min(1),
	actionId: z.string().min(1),
	runId: z.string().min(1),
	attempt: z.number().int().positive(),
	executorId: z.string().min(1),
	executorRevision: z.string().min(1),
	transport: z.enum(['local', 'grpc', 'rabbitmq', 'a2a']),
	leaseId: z.string().min(1).optional(),
	startedAt: z.string().datetime(),
}).strict();
export type ActionAttemptV1 = z.infer<typeof ActionAttemptSchema>;

export const ActionReceiptSchema = z.object({
	schema: z.literal(ATLAS_ACTION_RECEIPT_SCHEMA),
	actionId: z.string().min(1),
	attemptId: z.string().min(1),
	runId: z.string().min(1),
	executorId: z.string().min(1),
	executorRevision: z.string().min(1),
	startedAt: z.string().datetime(),
	completedAt: z.string().datetime(),
	inputs: z.array(ArtifactRefSchema).default([]),
	outputs: z.array(ArtifactRefSchema).default([]),
	observed: z.object({
		latencyMs: z.number().nonnegative(),
		peakVramBytes: z.number().int().nonnegative().optional(),
		peakHostBytes: z.number().int().nonnegative().optional(),
		candidatesIn: z.number().int().nonnegative().optional(),
		candidatesOut: z.number().int().nonnegative().optional(),
		graphHops: z.number().int().nonnegative().optional(),
		hyperedgesExpanded: z.number().int().nonnegative().optional(),
		tokensIn: z.number().int().nonnegative().optional(),
		tokensOut: z.number().int().nonnegative().optional(),
	}).strict(),
	result: z.enum(['SUCCESS', 'RETRYABLE_FAILURE', 'PERMANENT_FAILURE']),
	errorCode: z.string().min(1).optional(),
	checksum: z.string().min(1),
}).strict().superRefine((receipt, ctx) => {
	if (receipt.result === 'SUCCESS' && receipt.errorCode) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'successful receipt cannot carry errorCode' });
	}
});
export type ActionReceiptV1 = z.infer<typeof ActionReceiptSchema>;

export const PrefillReceiptSchema = z.object({
	schema: z.literal(ATLAS_PREFILL_RECEIPT_SCHEMA),
	prefillReceiptId: z.string().min(1),
	contextManifestChecksum: z.string().min(1),
	promptPlanChecksum: z.string().min(1),
	modelRevision: z.string().min(1),
	adapterRevision: z.string().min(1).nullable().optional(),
	promptTemplateRevision: z.string().min(1),
	tokenizerRevision: z.string().min(1),
	toolSchemaRevision: z.string().min(1),
	evidenceRevisions: z.array(z.string().min(1)).default([]),
	tensorArtifactRefs: z.array(z.string().min(1)).default([]),
	instructionRefs: z.array(z.string().min(1)).default([]),
	prefillIdentity: z.string().min(1),
	producerRevision: z.string().min(1),
}).strict();
export type PrefillReceiptV1 = z.infer<typeof PrefillReceiptSchema>;

export function buildArtifactRef(input: Omit<ArtifactRefV1, 'schema'>): ArtifactRefV1 {
	return ArtifactRefSchema.parse({ schema: ATLAS_ARTIFACT_REF_SCHEMA, ...input });
}

export function buildWorkflowAction(input: Omit<WorkflowActionV1, 'schema' | 'checksum'>): WorkflowActionV1 {
	const value = { schema: ATLAS_WORKFLOW_ACTION_SCHEMA_V1, ...input };
	return WorkflowActionSchema.parse({ ...value, checksum: canonicalPacketHash(value) });
}

export function buildWorkflowPlan(input: Omit<WorkflowPlanV1, 'schema' | 'planChecksum'>): WorkflowPlanV1 {
	const value = {
		schema: ATLAS_WORKFLOW_PLAN_SCHEMA,
		...input,
		entryActionIds: sortedUnique(input.entryActionIds),
		terminalActionIds: sortedUnique(input.terminalActionIds),
	};
	return WorkflowPlanSchema.parse({ ...value, planChecksum: canonicalPacketHash(value) });
}

export function buildActionReceipt(input: Omit<ActionReceiptV1, 'schema' | 'checksum'>): ActionReceiptV1 {
	const value = { schema: ATLAS_ACTION_RECEIPT_SCHEMA, ...input };
	return ActionReceiptSchema.parse({ ...value, checksum: canonicalPacketHash(value) });
}

export function buildSmartRpcPacket(input: Omit<SmartRpcPacketV1, 'schema' | 'contentChecksum'>): SmartRpcPacketV1 {
	const value = {
		schema: ATLAS_SMART_PACKET_SCHEMA,
		...input,
		evidenceRefs: sortedUnique(input.evidenceRefs),
	};
	return SmartRpcPacketSchema.parse({ ...value, contentChecksum: canonicalPacketHash(value) });
}

export function buildPrefillReceipt(input: Omit<PrefillReceiptV1, 'schema' | 'prefillIdentity'>): PrefillReceiptV1 {
	const canonical = {
		contextManifestChecksum: input.contextManifestChecksum,
		promptPlanChecksum: input.promptPlanChecksum,
		modelRevision: input.modelRevision,
		adapterRevision: input.adapterRevision ?? null,
		promptTemplateRevision: input.promptTemplateRevision,
		tokenizerRevision: input.tokenizerRevision,
		toolSchemaRevision: input.toolSchemaRevision,
		evidenceRevisions: sortedUnique(input.evidenceRevisions),
		tensorArtifactRefs: sortedUnique(input.tensorArtifactRefs),
		instructionRefs: sortedUnique(input.instructionRefs),
	};
	return PrefillReceiptSchema.parse({
		schema: ATLAS_PREFILL_RECEIPT_SCHEMA,
		...input,
		...canonical,
		prefillIdentity: canonicalPacketHash(canonical),
	});
}
