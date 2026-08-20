import assert from 'node:assert/strict';
import test from 'node:test';
import {
  a2aTaskProjectionSchema,
  buildParentAtlasStudioWorkflowProjection,
  buildValidatedWorkflowDispatch,
  gpuCodebaseIndexPlanSchema,
  graphifyDailyWorkflowPlanSchema,
  workflowEventToA2aTask,
  workflowEventToTaskBoardCard,
} from '../dist/index.js';

const checksum = 'a'.repeat(64);

function event(overrides = {}) {
  return {
    schema: 'atlas.workflow-action.v1',
    workflowId: 'wf:sv4-proof',
    workflowRevision: 7,
    sequence: 12,
    actionId: 'action:validate',
    dagNodeId: 'node:validate',
    attempt: 1,
    lane: 'validator',
    transport: 'local',
    kind: 'completed',
    receiptId: 'receipt:validation:1',
    resourceRefs: [
      { resource_type: 'source_ref', resource_id: 'packages/parent-atlas/fixtures/structured-value/ts-parity-fixture.ts', role: 'source', identity_status: 'canonical' },
    ],
    evidenceRefs: ['evidence:sv4', 'evidence:sv6'],
    artifactRefs: ['artifact:structured-value-arrow'],
    metadata: {},
    producerRevision: 'test:v1',
    ...overrides,
  };
}

test('WorkflowActionEvent projects to A2A 1.0 task/artifact without transferring canonical authority', () => {
  const task = workflowEventToA2aTask({
    event: event(),
    task_id: 'a2a-task:1',
    context_id: 'a2a-context:atlas',
    producer_revision: 'test:v1',
  });
  assert.equal(task.protocol_version, '1.0.0');
  assert.equal(task.state, 'TASK_STATE_COMPLETED');
  assert.equal(task.metadata.terminal, true);
  assert.equal(task.artifacts[0].artifactId, 'artifact:structured-value-arrow');
  assert.equal(task.canonical_authority, false);
});

test('A2A input/auth interruptions never become completed authorization', () => {
  for (const interruption of ['input_required', 'auth_required']) {
    const task = workflowEventToA2aTask({
      event: event({
        sequence: interruption === 'input_required' ? 13 : 14,
        actionId: `action:${interruption}`,
        dagNodeId: `node:${interruption}`,
        kind: 'blocked',
        lane: 'a2a',
        transport: 'a2a',
        receiptId: undefined,
        metadata: { a2a_interruption: interruption },
      }),
      task_id: `a2a-task:${interruption}`,
      context_id: 'a2a-context:atlas',
      producer_revision: 'test:v1',
    });
    assert.equal(task.metadata.interrupted, true);
    assert.notEqual(task.state, 'TASK_STATE_COMPLETED');
  }
});

test('A2A terminal state cannot omit terminal marker', () => {
  const good = workflowEventToA2aTask({
    event: event(),
    task_id: 'a2a-task:terminal',
    context_id: 'a2a-context:atlas',
    producer_revision: 'test:v1',
  });
  assert.throws(
    () => a2aTaskProjectionSchema.parse({ ...good, metadata: { ...good.metadata, terminal: false } }),
    /terminal A2A state must be marked terminal=true/,
  );
});

test('operational task board stays a noncanonical projection', () => {
  const card = workflowEventToTaskBoardCard({
    event: event(),
    title: 'Verify SV-4/SV-6 cross-runtime proof',
    feature_id: 'feature:structured-value',
    validation_receipt_ids: ['receipt:validation:1'],
    source_snapshot_revision: 'source:r7',
  });
  assert.equal(card.column, 'DONE');
  assert.equal(card.feature_board_canonical, false);
  assert.equal(card.canonical_authority, false);
});

test('GPU indexing APPLY requires validation and a GPU admission receipt', () => {
  assert.throws(
    () => buildValidatedWorkflowDispatch({
      dispatch_id: 'dispatch:gpu',
      workflow_id: 'wf:index',
      workflow_revision: 1,
      action_id: 'action:index',
      target: 'GPU_CODEBASE_INDEX',
      mode: 'APPLY',
      validation_receipt_ids: ['receipt:semantic-exact'],
      evidence_refs: [],
      artifact_refs: [],
      source_snapshot_revision: 'source:r1',
      graph_revision: 'graph:r1',
      feature_revision: 'feature:r1',
      semantic_revision: 'semantic:r1',
      gpu_resource_receipt_id: null,
      mutation_plan_id: null,
      producer_revision: 'test:v1',
    }),
    /GPU index APPLY requires an admitted GPU resource receipt/,
  );
});

test('CAGRA codebase index plan requires a cuVS exact oracle and one semantic lane vote', () => {
  const base = {
    schema: 'atlas.gpu-codebase-index-plan.v1',
    plan_id: 'index:1',
    workspace_revision: 'workspace:r1',
    source_snapshot_revision: 'source:r1',
    semantic_revision: 'semantic:r1',
    graph_revision: 'graph:r1',
    feature_revision: 'feature:r1',
    row_identity_checksum: checksum,
    canonical_semantic_dimension: 768,
    semantic_lane_votes: 1,
    exact_promotion_required: true,
    apply_requires_validation: true,
    canonical_authority: false,
    producer_revision: 'test:v1',
  };
  assert.throws(
    () => gpuCodebaseIndexPlanSchema.parse({
      ...base,
      stages: [{ stage_id: 'cagra', ordinal: 0, kind: 'CAGRA_BUILD', executor: 'CUVS', mutating: true, exact_oracle_required: true, validation_required: true, depends_on: [] }],
    }),
    /CAGRA_BUILD requires CUVS_EXACT_ORACLE/,
  );
  const valid = gpuCodebaseIndexPlanSchema.parse({
    ...base,
    stages: [
      { stage_id: 'exact', ordinal: 0, kind: 'CUVS_EXACT_ORACLE', executor: 'CUVS', mutating: false, exact_oracle_required: false, validation_required: true, depends_on: [] },
      { stage_id: 'cagra', ordinal: 1, kind: 'CAGRA_BUILD', executor: 'CUVS', mutating: true, exact_oracle_required: true, validation_required: true, depends_on: ['exact'] },
      { stage_id: 'align', ordinal: 2, kind: 'FEATURE_ALIGNMENT', executor: 'CPU', mutating: false, exact_oracle_required: false, validation_required: true, depends_on: ['cagra'] },
      { stage_id: 'parity', ordinal: 3, kind: 'RETRIEVAL_PARITY', executor: 'CPU', mutating: false, exact_oracle_required: true, validation_required: true, depends_on: ['exact', 'cagra'] },
    ],
  });
  assert.equal(valid.semantic_lane_votes, 1);
});

test('Graphify daily APPLY stages require validation receipts', () => {
  assert.throws(
    () => graphifyDailyWorkflowPlanSchema.parse({
      workflow_id: 'wf:daily',
      workflow_revision: 1,
      stages: ['REPOSITORY_PROVENANCE_DRY_RUN', 'GRAPHIFY_DAILY_CHAIN', 'NATIVE_STRUCTURAL_OWNER', 'GPU_CODEBASE_INDEX', 'KANBAN_REFRESH', 'STUDIO_REFRESH'],
      fallback_allowed: false,
      native_structural_apply: true,
      gpu_index_apply: true,
      validation_receipt_ids: [],
      canonical_authority: false,
      producer_revision: 'test:v1',
    }),
    /Graphify mutating\/index APPLY stages require validation receipts/,
  );
});

test('Studio projection carries cards and A2A tasks without becoming a state owner', () => {
  const eventValue = event();
  const card = workflowEventToTaskBoardCard({ event: eventValue, title: 'Validated structured-value proof' });
  const task = workflowEventToA2aTask({ event: eventValue, task_id: 'a2a-task:studio', context_id: 'a2a-context:studio', producer_revision: 'test:v1' });
  const projection = buildParentAtlasStudioWorkflowProjection({
    workflow_id: 'wf:sv4-proof',
    workflow_revision: 7,
    cards: [card],
    a2a_tasks: [task],
    latest_sequence: 12,
    source_snapshot_revision: 'source:r7',
    graph_revision: 'graph:r7',
    semantic_revision: 'semantic:r7',
    feature_revision: 'feature:r7',
    producer_revision: 'test:v1',
  });
  assert.equal(projection.cards.length, 1);
  assert.equal(projection.a2a_tasks.length, 1);
  assert.equal(projection.canonical_authority, false);
});
