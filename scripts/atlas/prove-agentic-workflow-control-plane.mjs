#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildParentAtlasStudioWorkflowProjection,
  buildValidatedWorkflowDispatch,
  gpuCodebaseIndexPlanSchema,
  graphifyDailyWorkflowPlanSchema,
  workflowActionEventSchema,
  workflowEventToA2aTask,
  workflowEventToTaskBoardCard,
  agenticWorkflowChecksum,
} from '../../packages/parent-atlas/dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const OUTPUT = process.argv.find((arg) => arg.startsWith('--output='))?.slice('--output='.length)
  ?? path.resolve(ROOT, '.tmp/atlas/agentic-workflow-control-plane.json');
const APPLY = process.argv.includes('--apply');
const checksum = 'a'.repeat(64);

function event(input) {
  return workflowActionEventSchema.parse({
    schema: 'atlas.workflow-action.v1',
    workflowId: 'workflow:daily-parent-atlas',
    workflowRevision: 1,
    sequence: input.sequence,
    actionId: input.actionId,
    parentActionId: input.parentActionId,
    dagNodeId: input.dagNodeId,
    attempt: 1,
    lane: input.lane,
    transport: input.transport ?? 'local',
    kind: input.kind,
    toolId: input.toolId,
    receiptId: input.receiptId,
    resourceRefs: input.resourceRefs ?? [],
    evidenceRefs: input.evidenceRefs ?? [],
    artifactRefs: input.artifactRefs ?? [],
    errorCode: input.errorCode,
    metadata: input.metadata ?? {},
    producerRevision: 'atlas.agentic-workflow-proof.v1',
  });
}

const validation = event({
  sequence: 10,
  actionId: 'action:structured-validation',
  dagNodeId: 'dag:structured-validation',
  lane: 'validator',
  kind: 'completed',
  receiptId: 'receipt:sv4-sv6-validation',
  evidenceRefs: ['evidence:sv4', 'evidence:sv6'],
  artifactRefs: ['artifact:structured-value-arrow'],
});

const gpuIndex = event({
  sequence: 20,
  actionId: 'action:gpu-codebase-index',
  parentActionId: validation.actionId,
  dagNodeId: 'dag:gpu-codebase-index',
  lane: 'gpu',
  kind: APPLY ? 'started' : 'scheduled',
  receiptId: undefined,
  evidenceRefs: validation.evidenceRefs,
  metadata: { mode: APPLY ? 'APPLY' : 'DRY_RUN' },
});

const a2a = workflowEventToA2aTask({
  event: gpuIndex,
  task_id: 'a2a-task:gpu-codebase-index',
  context_id: 'a2a-context:parent-atlas-daily',
  producer_revision: 'atlas.agentic-workflow-proof.v1',
});

const validationCard = workflowEventToTaskBoardCard({
  event: validation,
  title: 'Validate structured-value AST + Arrow proof',
  feature_id: 'feature:structured-value',
  validation_receipt_ids: [validation.receiptId],
  source_snapshot_revision: 'source:r1',
});
const gpuCard = workflowEventToTaskBoardCard({
  event: gpuIndex,
  title: 'Build GPU codebase retrieval index',
  feature_id: 'feature:gpu-codebase-index',
  validation_receipt_ids: [validation.receiptId],
  source_snapshot_revision: 'source:r1',
});

const gpuPlan = gpuCodebaseIndexPlanSchema.parse({
  plan_id: 'gpu-index-plan:r1',
  workspace_revision: 'workspace:r1',
  source_snapshot_revision: 'source:r1',
  semantic_revision: 'semantic:r1',
  graph_revision: 'graph:r1',
  feature_revision: 'feature:r1',
  row_identity_checksum: checksum,
  stages: [
    { stage_id: 'structural', ordinal: 0, kind: 'STRUCTURAL_SNAPSHOT', executor: 'CPU', mutating: false, validation_required: true, exact_oracle_required: false, depends_on: [] },
    { stage_id: 'embed', ordinal: 1, kind: 'SEMANTIC_EMBED', executor: 'PYTORCH', mutating: false, validation_required: true, exact_oracle_required: false, depends_on: ['structural'] },
    { stage_id: 'exact', ordinal: 2, kind: 'CUVS_EXACT_ORACLE', executor: 'CUVS', mutating: false, validation_required: true, exact_oracle_required: false, depends_on: ['embed'] },
    { stage_id: 'cagra', ordinal: 3, kind: 'CAGRA_BUILD', executor: 'CUVS', mutating: true, validation_required: true, exact_oracle_required: true, depends_on: ['exact'] },
    { stage_id: 'kmeans', ordinal: 4, kind: 'KMEANS_ASSIGN', executor: 'CUML', mutating: false, validation_required: true, exact_oracle_required: false, depends_on: ['embed'] },
    { stage_id: 'som', ordinal: 5, kind: 'SOM_ASSIGN', executor: 'CUSTOM', mutating: false, validation_required: true, exact_oracle_required: false, depends_on: ['embed'] },
    { stage_id: 'graph', ordinal: 6, kind: 'GRAPH_PROJECTION', executor: 'CUGRAPH', mutating: false, validation_required: true, exact_oracle_required: false, depends_on: ['structural'] },
    { stage_id: 'align', ordinal: 7, kind: 'FEATURE_ALIGNMENT', executor: 'CPU', mutating: false, validation_required: true, exact_oracle_required: false, depends_on: ['cagra', 'kmeans', 'som', 'graph'] },
    { stage_id: 'parity', ordinal: 8, kind: 'RETRIEVAL_PARITY', executor: 'CPU', mutating: false, validation_required: true, exact_oracle_required: true, depends_on: ['exact', 'cagra', 'align'] },
    { stage_id: 'qdrant', ordinal: 9, kind: 'QDRANT_UPSERT', executor: 'QDRANT', mutating: true, validation_required: true, exact_oracle_required: true, depends_on: ['parity'] },
  ],
  canonical_semantic_dimension: 768,
  semantic_lane_votes: 1,
  exact_promotion_required: true,
  apply_requires_validation: true,
  canonical_authority: false,
  producer_revision: 'atlas.agentic-workflow-proof.v1',
});

const graphifyPlan = graphifyDailyWorkflowPlanSchema.parse({
  workflow_id: 'workflow:daily-parent-atlas',
  workflow_revision: 1,
  stages: [
    'REPOSITORY_PROVENANCE_DRY_RUN',
    'GRAPHIFY_DAILY_CHAIN',
    'NATIVE_STRUCTURAL_OWNER',
    'FEATURE_RECOMMENDATION_REFRESH',
    'QAS_RECOMMENDATION_RECEIPT',
    'GPU_CODEBASE_INDEX',
    'KANBAN_REFRESH',
    'STUDIO_REFRESH',
  ],
  fallback_allowed: false,
  native_structural_apply: APPLY,
  gpu_index_apply: APPLY,
  validation_receipt_ids: APPLY ? ['receipt:sv4-sv6-validation'] : [],
  canonical_authority: false,
  producer_revision: 'atlas.agentic-workflow-proof.v1',
});

const gpuDispatch = buildValidatedWorkflowDispatch({
  dispatch_id: 'dispatch:gpu-codebase-index:r1',
  workflow_id: 'workflow:daily-parent-atlas',
  workflow_revision: 1,
  action_id: gpuIndex.actionId,
  target: 'GPU_CODEBASE_INDEX',
  mode: APPLY ? 'APPLY' : 'DRY_RUN',
  validation_receipt_ids: ['receipt:sv4-sv6-validation'],
  evidence_refs: gpuIndex.evidenceRefs,
  artifact_refs: [],
  source_snapshot_revision: 'source:r1',
  graph_revision: 'graph:r1',
  feature_revision: 'feature:r1',
  semantic_revision: 'semantic:r1',
  gpu_resource_receipt_id: APPLY ? process.env.ATLAS_GPU_RESOURCE_RECEIPT_ID ?? null : null,
  mutation_plan_id: null,
  producer_revision: 'atlas.agentic-workflow-proof.v1',
});

const studio = buildParentAtlasStudioWorkflowProjection({
  workflow_id: 'workflow:daily-parent-atlas',
  workflow_revision: 1,
  cards: [validationCard, gpuCard],
  a2a_tasks: [a2a],
  latest_sequence: gpuIndex.sequence,
  source_snapshot_revision: 'source:r1',
  graph_revision: 'graph:r1',
  semantic_revision: 'semantic:r1',
  feature_revision: 'feature:r1',
  producer_revision: 'atlas.agentic-workflow-proof.v1',
});

const receipt = {
  schema: 'atlas.agentic-workflow-control-plane-proof.v1',
  mode: APPLY ? 'APPLY' : 'DRY_RUN',
  validation_event: validation,
  gpu_index_event: gpuIndex,
  a2a_task: a2a,
  operational_kanban_cards: [validationCard, gpuCard],
  gpu_index_plan: gpuPlan,
  graphify_daily_plan: graphifyPlan,
  gpu_dispatch: gpuDispatch,
  parent_atlas_studio: studio,
  invariants: {
    workflow_event_is_internal_owner: true,
    a2a_is_projection: true,
    feature_kanban_is_separate: true,
    semantic_lane_votes: gpuPlan.semantic_lane_votes,
    cagra_has_exact_oracle: true,
    apply_requires_validation: true,
    gpu_apply_requires_resource_receipt: true,
  },
  canonical_authority: false,
};
receipt.proof_checksum = agenticWorkflowChecksum(receipt);

await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
await fs.writeFile(OUTPUT, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(receipt, null, 2));
