import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildJetStreamWorkflowEnvelopeV1,
  jetStreamWorkflowEnvelopeV1Schema,
} from '../dist/core/jetstream-workflow-envelope-v1.js';

const event = {
  schema: 'atlas.workflow-action.v1',
  workflowId: 'workflow:proof',
  workflowRevision: 1,
  sequence: 0,
  actionId: 'action:read',
  dagNodeId: 'node:read',
  attempt: 1,
  lane: 'validator',
  kind: 'started',
  resourceRefs: [],
  evidenceRefs: [],
  artifactRefs: [],
  metadata: {},
  producerRevision: 'producer:jetstream-test-v1',
};

test('builds a schema-validated read-only JetStream workflow envelope', () => {
  const envelope = buildJetStreamWorkflowEnvelopeV1({
    streamName: 'ATLAS_WORKFLOW',
    subject: 'workflow.node.started',
    messageId: 'message:1',
    workflowId: event.workflowId,
    workflowRevision: event.workflowRevision,
    dagNodeId: event.dagNodeId,
    sequence: event.sequence,
    event,
    source: 'read_only_replay',
    mutationRequested: false,
  });

  assert.equal(envelope.canonicalAuthority, false);
  assert.equal(envelope.databaseCommitRequired, true);
  assert.match(envelope.eventChecksum, /^[a-f0-9]{64}$/);
});

test('rejects envelope/event identity drift', () => {
  assert.throws(() => jetStreamWorkflowEnvelopeV1Schema.parse({
    streamName: 'ATLAS_WORKFLOW',
    subject: 'workflow.node.started',
    messageId: 'message:1',
    workflowId: event.workflowId,
    workflowRevision: event.workflowRevision,
    dagNodeId: 'node:other',
    sequence: event.sequence,
    event,
    source: 'read_only_replay',
    eventChecksum: 'a'.repeat(64),
  }));
});

test('rejects mutation envelopes that bypass the Postgres outbox', () => {
  assert.throws(() => jetStreamWorkflowEnvelopeV1Schema.parse({
    streamName: 'ATLAS_WORKFLOW',
    subject: 'workflow.node.started',
    messageId: 'message:1',
    workflowId: event.workflowId,
    workflowRevision: event.workflowRevision,
    dagNodeId: event.dagNodeId,
    sequence: event.sequence,
    event,
    source: 'read_only_replay',
    mutationRequested: true,
    eventChecksum: 'a'.repeat(64),
  }));
});
