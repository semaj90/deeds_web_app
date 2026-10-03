import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bindWorkflowCheckpointV1,
  buildWorkflowExecutionCoordinates,
  verifyWorkflowCheckpointBindingV1,
} from '../dist/index.js';

const coordinates = buildWorkflowExecutionCoordinates({
  schema: 'atlas.workflow-execution-coordinates.v1',
  workflowId: 'wf:checkpoint',
  workflowRevision: 3,
  workflowSpecChecksum: 'a'.repeat(64),
  framework: 'langgraph_stategraph',
  orchestrationRuntime: 'langgraph_pregel',
  checkpointProvider: 'memory',
  actionExecutor: 'local',
  transport: 'inproc',
  workflowActionEventSchema: 'atlas.workflow-action.v1',
  canonicalIdentityOwner: 'workflow_action_event',
});

function event(overrides = {}) {
  return {
    schema: 'atlas.workflow-action.v1',
    workflowId: 'wf:checkpoint',
    workflowRevision: 3,
    runId: 'run:1',
    sequence: 1,
    actionId: 'action:repair',
    dagNodeId: 'node:repair',
    attempt: 1,
    lane: 'tool',
    kind: 'started',
    producerRevision: 'producer:v1',
    metadata: { mutationAuthorization: 'human:approved' },
    ...overrides,
  };
}

test('binds checkpoint identity without changing workflow/action ownership', () => {
  const bound = bindWorkflowCheckpointV1({ event: event(), coordinates, checkpointId: 'cp:1', checkpointRevision: 'cp-rev:1' });
  const binding = verifyWorkflowCheckpointBindingV1(bound, coordinates);
  assert.equal(binding.canonicalIdentityOwner, 'workflow_action_event');
  assert.equal(binding.coordinatesChecksum, coordinates.coordinatesChecksum);
  assert.equal(bound.metadata.mutationAuthorization, 'human:approved');
});

test('keeps workflow/action identity stable across retry attempts', () => {
  const first = bindWorkflowCheckpointV1({ event: event(), coordinates, checkpointId: 'cp:1', checkpointRevision: 'cp-rev:1' });
  const retry = bindWorkflowCheckpointV1({ event: event({ attempt: 2, sequence: 2 }), coordinates, checkpointId: 'cp:2', checkpointRevision: 'cp-rev:2' });
  assert.equal(first.workflowId, retry.workflowId);
  assert.equal(first.actionId, retry.actionId);
  assert.equal(first.dagNodeId, retry.dagNodeId);
  assert.notEqual(first.metadata.checkpointBinding.checkpointId, retry.metadata.checkpointBinding.checkpointId);
});

test('rejects a checkpoint bound to different workflow coordinates', () => {
  assert.throws(() => bindWorkflowCheckpointV1({
    event: event(),
    coordinates: { ...coordinates, workflowRevision: 4, coordinatesChecksum: 'b'.repeat(64) },
    checkpointId: 'cp:1',
    checkpointRevision: 'cp-rev:1',
  }), /WORKFLOW_CHECKPOINT_COORDINATE_MISMATCH/);
});

test('rejects a tampered binding checksum', () => {
  const bound = bindWorkflowCheckpointV1({ event: event(), coordinates, checkpointId: 'cp:1', checkpointRevision: 'cp-rev:1' });
  const tampered = { ...bound, metadata: { ...bound.metadata, checkpointBinding: { ...bound.metadata.checkpointBinding, checkpointId: 'cp:tampered' } } };
  assert.throws(() => verifyWorkflowCheckpointBindingV1(tampered, coordinates), /WORKFLOW_CHECKPOINT_BINDING_CHECKSUM_MISMATCH/);
});
