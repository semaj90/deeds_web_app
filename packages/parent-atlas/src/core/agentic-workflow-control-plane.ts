import { createHash } from 'node:crypto';
import { z } from 'zod';
import { workflowActionEventSchema, type WorkflowActionEventV1 } from './workflow-action-event.js';

const id = z.string().min(1);
const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const A2A_PROTOCOL_VERSION = '1.0.0' as const;
export const A2A_TASK_STATES = [
  'TASK_STATE_SUBMITTED',
  'TASK_STATE_WORKING',
  'TASK_STATE_COMPLETED',
  'TASK_STATE_FAILED',
  'TASK_STATE_CANCELED',
  'TASK_STATE_INPUT_REQUIRED',
  'TASK_STATE_REJECTED',
  'TASK_STATE_AUTH_REQUIRED',
] as const;

export const atlasA2aPartSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string() }).strict(),
  z.object({ kind: z.literal('data'), data: z.record(z.string(), z.unknown()) }).strict(),
  z.object({ kind: z.literal('url'), url: z.string().url(), mediaType: z.string().min(1).optional() }).strict(),
]);

export const atlasA2aArtifactSchema = z.object({
  artifactId: id,
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  parts: z.array(atlasA2aPartSchema).min(1),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict();

export const a2aTaskProjectionSchema = z.object({
  schema: z.literal('atlas.a2a-task-projection.v1').default('atlas.a2a-task-projection.v1'),
  protocol: z.literal('A2A'),
  protocol_version: z.literal(A2A_PROTOCOL_VERSION),
  task_id: id,
  context_id: id,
  workflow_id: id,
  workflow_revision: z.number().int().nonnegative(),
  action_id: id,
  sequence: z.number().int().nonnegative(),
  state: z.enum(A2A_TASK_STATES),
  artifacts: z.array(atlasA2aArtifactSchema).default([]),
  evidence_refs: z.array(id).default([]),
  resource_refs: z.array(z.object({ resource_type: z.string().min(1), resource_id: id, role: z.string().min(1) }).strict()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
  projection_checksum: checksum,
  canonical_authority: z.literal(false).default(false),
  producer_revision: revision,
}).strict().superRefine((value, ctx) => {
  if (['TASK_STATE_COMPLETED', 'TASK_STATE_FAILED', 'TASK_STATE_CANCELED', 'TASK_STATE_REJECTED'].includes(value.state) && value.metadata['terminal'] !== true) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['metadata', 'terminal'], message: 'terminal A2A state must be marked terminal=true' });
  }
  if (['TASK_STATE_INPUT_REQUIRED', 'TASK_STATE_AUTH_REQUIRED'].includes(value.state) && value.metadata['interrupted'] !== true) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['metadata', 'interrupted'], message: 'interrupted A2A state must be marked interrupted=true' });
  }
});
export type A2aTaskProjectionV1 = z.infer<typeof a2aTaskProjectionSchema>;

export const acpLegacyIngressSchema = z.object({
  schema: z.literal('atlas.acp-legacy-ingress.v1').default('atlas.acp-legacy-ingress.v1'),
  ingress_id: id,
  acp_agent_id: id,
  acp_run_id: id,
  acp_session_id: id.nullable().default(null),
  received_at: z.string().datetime(),
  payload_checksum: checksum,
  payload: z.record(z.string(), z.unknown()),
  migration_target: z.literal('A2A_1_0'),
  outbound_acp_allowed: z.literal(false).default(false),
  canonical_authority: z.literal(false).default(false),
}).strict();
export type AcpLegacyIngressV1 = z.infer<typeof acpLegacyIngressSchema>;

export const acpToA2aMigrationReceiptSchema = z.object({
  schema: z.literal('atlas.acp-to-a2a-migration-receipt.v1').default('atlas.acp-to-a2a-migration-receipt.v1'),
  ingress_id: id,
  legacy_run_id: id,
  workflow_id: id,
  a2a_task_id: id,
  a2a_context_id: id,
  target_protocol_version: z.literal(A2A_PROTOCOL_VERSION),
  payload_checksum: checksum,
  migration_checksum: checksum,
  canonical_authority: z.literal(false).default(false),
  producer_revision: revision,
}).strict();
export type AcpToA2aMigrationReceiptV1 = z.infer<typeof acpToA2aMigrationReceiptSchema>;

export const VALIDATED_WORKFLOW_TARGETS = [
  'A2A_REMOTE_AGENT',
  'KANBAN_TASK_BOARD',
  'GRAPHIFY_DAILY',
  'PARENT_ATLAS_STUDIO',
  'GPU_CODEBASE_INDEX',
] as const;

export const validatedWorkflowDispatchSchema = z.object({
  schema: z.literal('atlas.validated-workflow-dispatch.v1').default('atlas.validated-workflow-dispatch.v1'),
  dispatch_id: id,
  workflow_id: id,
  workflow_revision: z.number().int().nonnegative(),
  action_id: id,
  target: z.enum(VALIDATED_WORKFLOW_TARGETS),
  mode: z.enum(['DRY_RUN', 'APPLY']),
  validation_receipt_ids: z.array(id).min(1),
  evidence_refs: z.array(id).default([]),
  artifact_refs: z.array(id).default([]),
  source_snapshot_revision: revision,
  graph_revision: revision.nullable().default(null),
  feature_revision: revision.nullable().default(null),
  semantic_revision: revision.nullable().default(null),
  gpu_resource_receipt_id: id.nullable().default(null),
  mutation_plan_id: id.nullable().default(null),
  dispatch_checksum: checksum,
  canonical_authority: z.literal(false).default(false),
  producer_revision: revision,
}).strict().superRefine((value, ctx) => {
  if (value.mode === 'APPLY' && value.target === 'GPU_CODEBASE_INDEX' && value.gpu_resource_receipt_id === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['gpu_resource_receipt_id'], message: 'GPU index APPLY requires an admitted GPU resource receipt' });
  }
  if (value.mode === 'APPLY' && value.mutation_plan_id !== null && value.validation_receipt_ids.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['validation_receipt_ids'], message: 'mutating APPLY requires validation evidence' });
  }
});
export type ValidatedWorkflowDispatchV1 = z.infer<typeof validatedWorkflowDispatchSchema>;

export const workflowTaskBoardCardSchema = z.object({
  schema: z.literal('atlas.workflow-task-board-card.v1').default('atlas.workflow-task-board-card.v1'),
  card_id: id,
  workflow_id: id,
  workflow_revision: z.number().int().nonnegative(),
  action_id: id,
  dag_node_id: id,
  lane: z.string().min(1),
  column: z.enum(['QUEUED', 'ACTIVE', 'BLOCKED', 'VERIFY', 'DONE', 'FAILED', 'CANCELED']),
  title: z.string().min(1),
  feature_id: id.nullable().default(null),
  evidence_refs: z.array(id).default([]),
  artifact_refs: z.array(id).default([]),
  validation_receipt_ids: z.array(id).default([]),
  source_snapshot_revision: revision.nullable().default(null),
  updated_sequence: z.number().int().nonnegative(),
  feature_board_canonical: z.literal(false).default(false),
  canonical_authority: z.literal(false).default(false),
}).strict();
export type WorkflowTaskBoardCardV1 = z.infer<typeof workflowTaskBoardCardSchema>;

export const parentAtlasStudioWorkflowProjectionSchema = z.object({
  schema: z.literal('atlas.parent-atlas-studio-workflow-projection.v1').default('atlas.parent-atlas-studio-workflow-projection.v1'),
  workflow_id: id,
  workflow_revision: z.number().int().nonnegative(),
  cards: z.array(workflowTaskBoardCardSchema),
  a2a_tasks: z.array(a2aTaskProjectionSchema),
  latest_sequence: z.number().int().nonnegative(),
  source_snapshot_revision: revision,
  graph_revision: revision.nullable().default(null),
  semantic_revision: revision.nullable().default(null),
  feature_revision: revision.nullable().default(null),
  projection_checksum: checksum,
  canonical_authority: z.literal(false).default(false),
  producer_revision: revision,
}).strict();
export type ParentAtlasStudioWorkflowProjectionV1 = z.infer<typeof parentAtlasStudioWorkflowProjectionSchema>;

export const gpuCodebaseIndexStageSchema = z.object({
  stage_id: id,
  ordinal: z.number().int().nonnegative(),
  kind: z.enum([
    'STRUCTURAL_SNAPSHOT',
    'SEMANTIC_EMBED',
    'QDRANT_UPSERT',
    'GRAPH_PROJECTION',
    'CUVS_EXACT_ORACLE',
    'CAGRA_BUILD',
    'KMEANS_ASSIGN',
    'SOM_ASSIGN',
    'FEATURE_ALIGNMENT',
    'RETRIEVAL_PARITY',
  ]),
  executor: z.enum(['CPU', 'PYTORCH', 'QDRANT', 'NEO4J', 'CUVS', 'CUGRAPH', 'CUML', 'CUSTOM']),
  mutating: z.boolean(),
  exact_oracle_required: z.boolean().default(false),
  validation_required: z.boolean().default(true),
  depends_on: z.array(id).default([]),
}).strict();

export const gpuCodebaseIndexPlanSchema = z.object({
  schema: z.literal('atlas.gpu-codebase-index-plan.v1').default('atlas.gpu-codebase-index-plan.v1'),
  plan_id: id,
  workspace_revision: revision,
  source_snapshot_revision: revision,
  semantic_revision: revision,
  graph_revision: revision,
  feature_revision: revision,
  row_identity_checksum: checksum,
  stages: z.array(gpuCodebaseIndexStageSchema).min(1),
  canonical_semantic_dimension: z.literal(768),
  semantic_lane_votes: z.literal(1),
  exact_promotion_required: z.literal(true),
  apply_requires_validation: z.literal(true),
  canonical_authority: z.literal(false).default(false),
  producer_revision: revision,
}).strict().superRefine((value, ctx) => {
  const ids = new Set(value.stages.map((stage) => stage.stage_id));
  if (ids.size !== value.stages.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['stages'], message: 'stage_id must be unique' });
  const ordinals = value.stages.map((stage) => stage.ordinal).sort((a, b) => a - b);
  if (ordinals.some((ordinal, index) => ordinal !== index)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['stages'], message: 'stage ordinals must be dense 0..N-1' });
  for (const stage of value.stages) for (const dependency of stage.depends_on) if (!ids.has(dependency)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['stages'], message: `unknown dependency ${dependency}` });
  const cagra = value.stages.find((stage) => stage.kind === 'CAGRA_BUILD');
  const exact = value.stages.find((stage) => stage.kind === 'CUVS_EXACT_ORACLE');
  if (cagra && !exact) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['stages'], message: 'CAGRA_BUILD requires CUVS_EXACT_ORACLE in the plan' });
}).strict();
export type GpuCodebaseIndexPlanV1 = z.infer<typeof gpuCodebaseIndexPlanSchema>;

export const graphifyDailyWorkflowPlanSchema = z.object({
  schema: z.literal('atlas.graphify-daily-workflow-plan.v1').default('atlas.graphify-daily-workflow-plan.v1'),
  workflow_id: id,
  workflow_revision: z.number().int().nonnegative(),
  stages: z.array(z.enum([
    'REPOSITORY_PROVENANCE_DRY_RUN',
    'GRAPHIFY_DAILY_CHAIN',
    'NATIVE_STRUCTURAL_OWNER',
    'FEATURE_RECOMMENDATION_REFRESH',
    'QAS_RECOMMENDATION_RECEIPT',
    'GPU_CODEBASE_INDEX',
    'KANBAN_REFRESH',
    'STUDIO_REFRESH',
  ])).min(1),
  fallback_allowed: z.boolean(),
  native_structural_apply: z.boolean(),
  gpu_index_apply: z.boolean(),
  validation_receipt_ids: z.array(id).default([]),
  canonical_authority: z.literal(false).default(false),
  producer_revision: revision,
}).strict().superRefine((value, ctx) => {
  if ((value.native_structural_apply || value.gpu_index_apply) && value.validation_receipt_ids.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['validation_receipt_ids'], message: 'Graphify mutating/index APPLY stages require validation receipts' });
  }
});
export type GraphifyDailyWorkflowPlanV1 = z.infer<typeof graphifyDailyWorkflowPlanSchema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function agenticWorkflowChecksum(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

function a2aStateForEvent(event: WorkflowActionEventV1): typeof A2A_TASK_STATES[number] {
  switch (event.kind) {
    case 'scheduled': return 'TASK_STATE_SUBMITTED';
    case 'completed': return 'TASK_STATE_COMPLETED';
    case 'failed': return 'TASK_STATE_FAILED';
    case 'cancelled': return 'TASK_STATE_CANCELED';
    case 'blocked': {
      if (event.metadata['a2a_interruption'] === 'input_required') return 'TASK_STATE_INPUT_REQUIRED';
      if (event.metadata['a2a_interruption'] === 'auth_required') return 'TASK_STATE_AUTH_REQUIRED';
      return 'TASK_STATE_WORKING';
    }
    default: return 'TASK_STATE_WORKING';
  }
}

export function workflowEventToA2aTask(input: {
  event: z.input<typeof workflowActionEventSchema>;
  task_id: string;
  context_id: string;
  producer_revision: string;
}): A2aTaskProjectionV1 {
  const event = workflowActionEventSchema.parse(input.event);
  const state = a2aStateForEvent(event);
  const terminal = ['TASK_STATE_COMPLETED', 'TASK_STATE_FAILED', 'TASK_STATE_CANCELED', 'TASK_STATE_REJECTED'].includes(state);
  const interrupted = ['TASK_STATE_INPUT_REQUIRED', 'TASK_STATE_AUTH_REQUIRED'].includes(state);
  const artifacts: z.infer<typeof atlasA2aArtifactSchema>[] = event.artifactRefs.map((artifactId) => ({
    artifactId,
    parts: [{ kind: 'data' as const, data: { atlasArtifactRef: artifactId } }],
    metadata: { workflowId: event.workflowId, actionId: event.actionId, sequence: event.sequence },
  }));
  const raw = {
    schema: 'atlas.a2a-task-projection.v1' as const,
    protocol: 'A2A' as const,
    protocol_version: A2A_PROTOCOL_VERSION,
    task_id: input.task_id,
    context_id: input.context_id,
    workflow_id: event.workflowId,
    workflow_revision: event.workflowRevision,
    action_id: event.actionId,
    sequence: event.sequence,
    state,
    artifacts,
    evidence_refs: event.evidenceRefs,
    resource_refs: event.resourceRefs.map((resource) => ({ resource_type: resource.resource_type, resource_id: resource.resource_id, role: resource.role })),
    metadata: {
      atlasLane: event.lane,
      atlasKind: event.kind,
      atlasTransport: event.transport ?? null,
      receiptId: event.receiptId ?? null,
      errorCode: event.errorCode ?? null,
      terminal,
      interrupted,
    },
    canonical_authority: false as const,
    producer_revision: input.producer_revision,
  };
  return a2aTaskProjectionSchema.parse({ ...raw, projection_checksum: agenticWorkflowChecksum(raw) });
}

export function workflowEventToTaskBoardCard(input: {
  event: z.input<typeof workflowActionEventSchema>;
  title: string;
  feature_id?: string | null;
  validation_receipt_ids?: string[];
  source_snapshot_revision?: string | null;
}): WorkflowTaskBoardCardV1 {
  const event = workflowActionEventSchema.parse(input.event);
  const column: WorkflowTaskBoardCardV1['column'] = event.kind === 'scheduled' ? 'QUEUED'
    : event.kind === 'blocked' ? 'BLOCKED'
    : event.kind === 'failed' ? 'FAILED'
    : event.kind === 'cancelled' ? 'CANCELED'
    : event.kind === 'completed' ? (event.lane === 'validator' ? 'DONE' : 'VERIFY')
    : event.lane === 'validator' ? 'VERIFY'
    : 'ACTIVE';
  return workflowTaskBoardCardSchema.parse({
    card_id: `workflow-card:${event.workflowId}:${event.actionId}`,
    workflow_id: event.workflowId,
    workflow_revision: event.workflowRevision,
    action_id: event.actionId,
    dag_node_id: event.dagNodeId,
    lane: event.lane,
    column,
    title: input.title,
    feature_id: input.feature_id ?? null,
    evidence_refs: event.evidenceRefs,
    artifact_refs: event.artifactRefs,
    validation_receipt_ids: input.validation_receipt_ids ?? [],
    source_snapshot_revision: input.source_snapshot_revision ?? null,
    updated_sequence: event.sequence,
    feature_board_canonical: false,
    canonical_authority: false,
  });
}

export function buildValidatedWorkflowDispatch(input: Omit<z.input<typeof validatedWorkflowDispatchSchema>, 'schema' | 'dispatch_checksum' | 'canonical_authority'>): ValidatedWorkflowDispatchV1 {
  const raw = { schema: 'atlas.validated-workflow-dispatch.v1' as const, ...input, canonical_authority: false as const };
  return validatedWorkflowDispatchSchema.parse({ ...raw, dispatch_checksum: agenticWorkflowChecksum(raw) });
}

export function buildParentAtlasStudioWorkflowProjection(input: Omit<z.input<typeof parentAtlasStudioWorkflowProjectionSchema>, 'schema' | 'projection_checksum' | 'canonical_authority'>): ParentAtlasStudioWorkflowProjectionV1 {
  const raw = { schema: 'atlas.parent-atlas-studio-workflow-projection.v1' as const, ...input, canonical_authority: false as const };
  return parentAtlasStudioWorkflowProjectionSchema.parse({ ...raw, projection_checksum: agenticWorkflowChecksum(raw) });
}

export function buildAcpMigrationReceipt(input: Omit<z.input<typeof acpToA2aMigrationReceiptSchema>, 'schema' | 'migration_checksum' | 'canonical_authority'>): AcpToA2aMigrationReceiptV1 {
  const raw = { schema: 'atlas.acp-to-a2a-migration-receipt.v1' as const, ...input, canonical_authority: false as const };
  return acpToA2aMigrationReceiptSchema.parse({ ...raw, migration_checksum: agenticWorkflowChecksum(raw) });
}

export function describeAgenticWorkflowControlPlane(): string {
  return [
    'WorkflowActionEventV1 remains the internal ordered runtime event; A2A Task/Artifact objects are protocol projections and never canonical Atlas identity owners.',
    'ACP is accepted only through an explicitly legacy ingress whose migration target is A2A 1.0; outbound ACP is disabled.',
    'A2A artifacts carry workflow artifact references while status/messages carry progress; interrupted AUTH_REQUIRED never authorizes a mutation by itself.',
    'The workflow task board is an operational Kanban projection and is deliberately separate from the canonical FeatureV1/FeatureStateV1 Kanban materializer.',
    'Graphify daily, Studio refresh, A2A dispatch and GPU codebase indexing APPLY paths require validation receipts; GPU APPLY additionally requires a GPU resource-admission receipt.',
    'CAGRA remains a semantic executor/challenger and requires a cuVS exact oracle in the same index plan; semantic_lane_votes stays exactly one.',
  ].join(' ');
}
