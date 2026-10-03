import test from 'node:test';
import assert from 'node:assert/strict';
import { workflowActionEventSchema } from '@deeds/parent-atlas/core/workflow-action-event';
import { buildPhase79CanonicalWorkflowActionEvent } from './phase79-canonical-workflow-action-event.mts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const BASE_INPUT = {
  sessionId: 'phase79:test-session',
  suggestionId: 'a1b2c3d4-e5f6-4789-a0b1-c2d3e4f5a6b7',
  clusterId: 'cluster-42',
  sourceRef: 'sveltekit-frontend/src/routes/example/+page.svelte',
  proposalChecksum: 'sha256-fake-proposal-checksum',
  packets: [{ packetKey: 'packet:abc123' }, { packetKey: null }],
  producerRevision: 'phase79-agentic-repair.v2',
  startedAt: '2026-09-14T10:00:00.000Z',
  completedAt: '2026-09-14T10:00:05.000Z',
};

test('succeeded repair with a persisted ledger row builds a valid completed event', () => {
  const result = buildPhase79CanonicalWorkflowActionEvent({
    ...BASE_INPUT,
    status: 'succeeded',
    failureReason: null,
    ledgerPersisted: true,
    ledgerRowId: 4821,
  });

  assert.equal(result.skipped, false);
  if (result.skipped) return;

  assert.equal(result.event.kind, 'completed');
  assert.equal(result.event.receiptId, '4821');
  assert.match(result.event.runId ?? '', UUID);
  assert.match(result.event.actionId, UUID);
  assert.equal(result.event.workflowId, `phase79-repair:${BASE_INPUT.suggestionId}`);
  assert.equal(result.event.dagNodeId, 'phase79.repair-attempt');
  assert.equal(result.event.lane, 'tool');
  assert.deepEqual(result.event.resourceRefs, [
    { resource_type: 'packet', resource_id: 'packet:abc123', role: 'evidence', identity_status: 'canonical' },
  ]);
  assert.deepEqual(result.event.evidenceRefs, [BASE_INPUT.suggestionId]);
  assert.equal(result.idempotencyKey, `phase79:${BASE_INPUT.suggestionId}:${BASE_INPUT.proposalChecksum}`);

  // Round-trip through the real canonical schema -- proves this is not just shaped like a
  // WorkflowActionEventV1, it actually validates as one (including the completed->receiptId
  // superRefine constraint).
  assert.doesNotThrow(() => workflowActionEventSchema.parse(result.event));
});

test('succeeded repair with no persisted ledger row is honestly skipped, not forced', () => {
  const result = buildPhase79CanonicalWorkflowActionEvent({
    ...BASE_INPUT,
    status: 'succeeded',
    failureReason: null,
    ledgerPersisted: false,
    ledgerRowId: null,
  });

  assert.equal(result.skipped, true);
  if (!result.skipped) return;
  assert.equal(result.reason, 'NO_RECEIPT_ID_AVAILABLE_LEDGER_NOT_PERSISTED');
});

test('failed repair builds a valid failed event with errorCode derived from the real failure message', () => {
  const result = buildPhase79CanonicalWorkflowActionEvent({
    ...BASE_INPUT,
    status: 'failed',
    failureReason: 'VERIFICATION_NOT_IMPROVED:before=3/1:after=3/1',
    ledgerPersisted: false,
    ledgerRowId: null,
  });

  assert.equal(result.skipped, false);
  if (result.skipped) return;

  assert.equal(result.event.kind, 'failed');
  assert.equal(result.event.errorCode, 'VERIFICATION_NOT_IMPROVED');
  assert.equal(result.event.receiptId, undefined);
  assert.doesNotThrow(() => workflowActionEventSchema.parse(result.event));
});

test('failed repair with a null failureReason falls back to UNKNOWN_FAILURE rather than throwing', () => {
  const result = buildPhase79CanonicalWorkflowActionEvent({
    ...BASE_INPUT,
    status: 'failed',
    failureReason: null,
    ledgerPersisted: false,
    ledgerRowId: null,
  });

  assert.equal(result.skipped, false);
  if (result.skipped) return;
  assert.equal(result.event.errorCode, 'UNKNOWN_FAILURE');
});

test('two attempts on the same suggestion with different proposals get different idempotency keys', () => {
  const first = buildPhase79CanonicalWorkflowActionEvent({
    ...BASE_INPUT,
    status: 'failed',
    failureReason: 'X',
    ledgerPersisted: false,
    ledgerRowId: null,
    proposalChecksum: 'checksum-a',
  });
  const second = buildPhase79CanonicalWorkflowActionEvent({
    ...BASE_INPUT,
    status: 'failed',
    failureReason: 'X',
    ledgerPersisted: false,
    ledgerRowId: null,
    proposalChecksum: 'checksum-b',
  });

  assert.equal(first.skipped, false);
  assert.equal(second.skipped, false);
  if (first.skipped || second.skipped) return;
  assert.notEqual(first.idempotencyKey, second.idempotencyKey);
});
