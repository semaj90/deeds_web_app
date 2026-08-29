import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWorkflowExecutionCoordinates, workflowExecutionCoordinatesSchema } from '../dist/core/workflow-execution-coordinates-v1.js';

const input = {
  schema: 'atlas.workflow-execution-coordinates.v1',
  workflowId: 'wf:fixture',
  workflowRevision: 1,
  workflowSpecChecksum: 'a'.repeat(64),
  framework: 'langgraph_stategraph',
  orchestrationRuntime: 'langgraph_pregel',
  checkpointProvider: 'none',
  actionExecutor: 'local',
  transport: 'inproc',
  workflowActionEventSchema: 'atlas.workflow-action.v1',
  canonicalIdentityOwner: 'workflow_action_event',
};

test('builds deterministic execution coordinates without moving identity authority', () => {
  const first = buildWorkflowExecutionCoordinates(input);
  const second = buildWorkflowExecutionCoordinates(input);
  assert.deepEqual(first, second);
  assert.equal(first.coordinatesChecksum.length, 64);
  assert.equal(workflowExecutionCoordinatesSchema.parse(first).canonicalIdentityOwner, 'workflow_action_event');
});

test('separates framework from action executor and transport', () => {
  const coordinates = buildWorkflowExecutionCoordinates({
    ...input,
    framework: 'local',
    orchestrationRuntime: 'in_process',
    actionExecutor: 'gpu_worker',
    transport: 'grpc',
  });
  assert.equal(coordinates.framework, 'local');
  assert.equal(coordinates.actionExecutor, 'gpu_worker');
  assert.equal(coordinates.transport, 'grpc');
});
