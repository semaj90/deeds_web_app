import test from 'node:test';
import assert from 'node:assert/strict';

import {
  A2A_PROTOCOL_VERSION,
  A2A_RELEASE_VERSION,
  a2aAgentInterfaceSchema,
  a2aPartSchema,
  a2aStreamResponseSchema,
  workflowEventToA2aWire,
} from '../dist/core/a2a-wire-v1.js';

const event = {
  schema: 'atlas.workflow-action.v1',
  workflowId: 'wf-1',
  workflowRevision: 3,
  sequence: 9,
  actionId: 'action-1',
  dagNodeId: 'node-1',
  attempt: 1,
  lane: 'validator',
  transport: 'a2a',
  kind: 'completed',
  receiptId: 'receipt-1',
  resourceRefs: [{ resource_type: 'source_ref', resource_id: 'src/a.ts', role: 'source', identity_status: 'canonical' }],
  evidenceRefs: ['evidence-1'],
  artifactRefs: ['artifact-1'],
  metadata: {},
  producerRevision: 'producer-r1',
};

test('A2A release and protocol wire versions are intentionally distinct', () => {
  assert.equal(A2A_RELEASE_VERSION, '1.0.0');
  assert.equal(A2A_PROTOCOL_VERSION, '1.0');
});

test('A2A Part requires exactly one content member', () => {
  assert.equal(a2aPartSchema.parse({ text: 'hello' }).text, 'hello');
  assert.throws(() => a2aPartSchema.parse({ text: 'hello', data: { duplicate: true } }));
  assert.throws(() => a2aPartSchema.parse({ mediaType: 'text/plain' }));
});

test('A2A AgentInterface uses core v1 binding tokens and version syntax', () => {
  assert.equal(a2aAgentInterfaceSchema.parse({
    url: 'https://agent.example/a2a',
    protocolBinding: 'JSONRPC',
    protocolVersion: '1.0',
  }).protocolBinding, 'JSONRPC');

  assert.equal(a2aAgentInterfaceSchema.parse({
    url: 'agent.internal:50051',
    protocolBinding: 'GRPC',
    protocolVersion: '1.0',
  }).protocolBinding, 'GRPC');

  assert.throws(() => a2aAgentInterfaceSchema.parse({
    url: 'https://agent.example/a2a',
    protocolBinding: 'JSON-RPC',
    protocolVersion: '1.0.0',
  }));
});

test('Workflow event projects into actual A2A Task shape and oneof stream responses', () => {
  const projected = workflowEventToA2aWire({
    event,
    task_id: 'task-1',
    context_id: 'context-1',
    timestamp: '2026-08-19T20:00:00Z',
    producer_revision: 'adapter-r1',
  });

  assert.equal(projected.task.id, 'task-1');
  assert.equal(projected.task.contextId, 'context-1');
  assert.equal(projected.task.status.state, 'TASK_STATE_COMPLETED');
  assert.equal(projected.task.metadata.atlasWorkflowId, 'wf-1');
  assert.equal(projected.task.metadata.canonicalAuthority, false);
  assert.equal(projected.task.artifacts.length, 1);
  assert.equal(projected.task.artifacts[0].artifactId, 'artifact-1');
  assert.equal(projected.receipt.protocol_version, '1.0');
  assert.equal(projected.receipt.protocol_release, '1.0.0');

  for (const response of projected.streamResponses) {
    const members = ['task', 'message', 'statusUpdate', 'artifactUpdate'].filter((key) => response[key] !== undefined);
    assert.equal(members.length, 1);
    assert.equal('kind' in response, false);
    assert.equal('final' in response, false);
  }
});

test('A2A StreamResponse rejects legacy multi-member/event-discriminator shapes', () => {
  assert.throws(() => a2aStreamResponseSchema.parse({
    task: {
      id: 'task-1',
      contextId: 'context-1',
      status: { state: 'TASK_STATE_WORKING' },
    },
    statusUpdate: {
      taskId: 'task-1',
      contextId: 'context-1',
      status: { state: 'TASK_STATE_WORKING' },
    },
  }));
  assert.throws(() => a2aStreamResponseSchema.parse({ kind: 'status-update', final: true }));
});

test('AUTH_REQUIRED is interrupted state and never authorization evidence', () => {
  const blocked = workflowEventToA2aWire({
    event: {
      ...event,
      sequence: 10,
      kind: 'blocked',
      receiptId: undefined,
      artifactRefs: [],
      metadata: { a2a_interruption: 'auth_required' },
    },
    task_id: 'task-auth',
    context_id: 'context-1',
    producer_revision: 'adapter-r1',
  });
  assert.equal(blocked.task.status.state, 'TASK_STATE_AUTH_REQUIRED');
  assert.equal(blocked.task.metadata.atlasReceiptId, null);
  assert.equal(blocked.task.metadata.canonicalAuthority, false);
});
