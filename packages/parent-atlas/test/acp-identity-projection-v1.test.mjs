import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agenticWorkflowChecksum,
  buildAcpIdentityProjectionV1,
} from '../dist/core/agentic-workflow-control-plane.js';

const contextManifestChecksum = 'a'.repeat(64);
const executionReceiptId = 'receipt:task-7:run-9';
const atlasRunId = '8e0b93cb-8707-44b0-9e7d-06a36f45a209';
const atlasActionId = 'b01bfad3-6f8b-4be9-9d32-e2a9c3dd5cc3';
const ingressPayload = { task_id: 'acp-task-2', action_id: 'acp-action-3' };
const ingress = {
  schema: 'atlas.acp-legacy-ingress.v1',
  ingress_id: 'ingress:1',
  acp_agent_id: 'agent:external',
  acp_run_id: 'acp-run:4',
  acp_session_id: 'acp-session:5',
  received_at: '2026-09-22T20:00:00.000Z',
  payload_checksum: agenticWorkflowChecksum(ingressPayload),
  payload: ingressPayload,
  migration_target: 'A2A_1_0',
  outbound_acp_allowed: false,
  canonical_authority: false,
};
const event = {
  schema: 'atlas.workflow-action.v1',
  workflowId: 'workflow:1',
  workflowRevision: 2,
  runId: atlasRunId,
  sequence: 3,
  actionId: atlasActionId,
  dagNodeId: 'dag:node:1',
  attempt: 1,
  lane: 'acp',
  transport: 'acp',
  kind: 'completed',
  receiptId: executionReceiptId,
  revisions: { workspace: 'workspace:sha256:abc' },
  producerRevision: 'workflow-runtime:v1',
};
const taskAttempt = {
  id: 7,
  taskId: 'task:canonical',
  runId: atlasRunId,
  worker: 'worker:1',
  startedAt: '2026-09-22T19:59:00.000Z',
  success: true,
  executionReceiptId,
};

test('maps ACP external refs onto existing Atlas task/run/action/manifest/receipt refs without graph identity', () => {
  const projection = buildAcpIdentityProjectionV1({
    ingress,
    externalTaskId: ingressPayload.task_id,
    externalActionId: ingressPayload.action_id,
    taskAttempt,
    event,
    contextManifestChecksum,
  });
  assert.equal(projection.external.sessionId, ingress.acp_session_id);
  assert.equal(projection.external.runId, ingress.acp_run_id);
  assert.equal(projection.atlas.runId, event.runId);
  assert.equal(projection.atlas.taskId, taskAttempt.taskId);
  assert.equal(projection.atlas.actionId, event.actionId);
  assert.equal(projection.atlas.contextManifestChecksum, contextManifestChecksum);
  assert.equal(projection.atlas.executionReceiptId, executionReceiptId);
  assert.equal(projection.graphIdentity, null);
  assert.equal(projection.canonicalAuthority, false);
  assert.equal(projection.writesPerformed, false);
});

test('fails closed when the task attempt belongs to another run', () => {
  assert.throws(() => buildAcpIdentityProjectionV1({
    ingress,
    externalTaskId: ingressPayload.task_id,
    externalActionId: ingressPayload.action_id,
    taskAttempt: { ...taskAttempt, runId: 'run:other' },
    event,
    contextManifestChecksum,
  }), /ACP_IDENTITY_TASK_RUN_MISMATCH/);
});

test('fails closed when task attempt and workflow event receipt IDs differ', () => {
  assert.throws(() => buildAcpIdentityProjectionV1({
    ingress,
    externalTaskId: ingressPayload.task_id,
    externalActionId: ingressPayload.action_id,
    taskAttempt: { ...taskAttempt, executionReceiptId: 'receipt:other' },
    event,
    contextManifestChecksum,
  }), /ACP_IDENTITY_EXECUTION_RECEIPT_MISMATCH/);
});

test('fails closed for a corrupted external ingress payload checksum', () => {
  assert.throws(() => buildAcpIdentityProjectionV1({
    ingress: { ...ingress, payload: { task_id: 'tampered' } },
    externalTaskId: ingressPayload.task_id,
    externalActionId: ingressPayload.action_id,
    taskAttempt,
    event,
    contextManifestChecksum,
  }), /ACP_IDENTITY_INGRESS_PAYLOAD_CHECKSUM_MISMATCH/);
});

test('fails closed when supplied ACP task/action refs do not match the checksummed ingress payload', () => {
  assert.throws(() => buildAcpIdentityProjectionV1({
    ingress,
    externalTaskId: 'acp-task:other',
    externalActionId: ingressPayload.action_id,
    taskAttempt,
    event,
    contextManifestChecksum,
  }), /ACP_IDENTITY_EXTERNAL_REFERENCE_MISMATCH/);
});

test('requires an existing context-manifest digest', () => {
  assert.throws(() => buildAcpIdentityProjectionV1({
    ingress,
    externalTaskId: ingressPayload.task_id,
    externalActionId: ingressPayload.action_id,
    taskAttempt,
    event,
    contextManifestChecksum: 'not-a-checksum',
  }));
});
