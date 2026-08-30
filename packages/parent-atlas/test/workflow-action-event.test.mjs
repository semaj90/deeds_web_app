import test from 'node:test';
import assert from 'node:assert/strict';

import {
  workflowActionEventSchema,
  workflowActionEventToRuntimeEvidence,
} from '../dist/core/workflow-action-event.js';
import { extractRuntimeEvidenceEntities } from '../dist/core/evidence-entity-extractors.js';

const completed = {
  schema: 'atlas.workflow-action.v1',
  workflowId: 'workflow:graphify:742',
  workflowRevision: 742,
  sequence: 17,
  actionId: 'action:materialize-symbols',
  dagNodeId: 'dag:structural-materializer',
  attempt: 1,
  lane: 'materializer',
  transport: 'local',
  kind: 'completed',
  toolId: 'tool:graphify-structural-materializer',
  receiptId: 'receipt:materialize-symbols:742:17',
  resourceRefs: [{ resource_type: 'table', resource_id: 'table:atlas_symbol_registry', role: 'writes' }],
  evidenceRefs: ['evidence:ast:src-r1'],
  artifactRefs: [],
  startedAt: '2026-08-18T20:00:00.000Z',
  completedAt: '2026-08-18T20:00:01.000Z',
  metadata: {},
  producerRevision: 'workflow-runtime-r1',
};

test('completed workflow action requires a canonical receipt ID', () => {
  assert.throws(() => workflowActionEventSchema.parse({ ...completed, receiptId: undefined }));
});

test('workflow event accepts bounded token, source-edit, and OpenSpec telemetry', () => {
  const parsed = workflowActionEventSchema.parse({
    ...completed,
    lane: 'a2a',
    transport: 'a2a',
    tokensUsed: 12345,
    filesEdited: ['src/lib/a.ts', 'src/lib/b.ts'],
    openspecChange: 'parent-atlas-agentic-run-receipt-binding',
  });
  assert.equal(parsed.tokensUsed, 12345);
  assert.deepEqual(parsed.filesEdited, ['src/lib/a.ts', 'src/lib/b.ts']);
  assert.equal(parsed.openspecChange, 'parent-atlas-agentic-run-receipt-binding');
});

test('workflow event rejects invalid enriched telemetry', () => {
  assert.throws(() => workflowActionEventSchema.parse({ ...completed, tokensUsed: -1 }));
  assert.throws(() => workflowActionEventSchema.parse({ ...completed, filesEdited: [' src/lib/a.ts'] }));
  assert.throws(() => workflowActionEventSchema.parse({ ...completed, openspecChange: ' bad-change ' }));
});

test('workflow event produces runtime evidence with the same action/tool/receipt/resource identities', () => {
  const { payload, receipt } = workflowActionEventToRuntimeEvidence(completed);
  assert.equal(payload.action.action_id, completed.actionId);
  assert.equal(payload.tool.tool_id, completed.toolId);
  assert.equal(payload.receipt.receipt_id, completed.receiptId);
  assert.equal(payload.resources[0].resource_id, 'table:atlas_symbol_registry');
  assert.equal(receipt.canonical_identity_owner, 'workflow_runtime');
});

test('runtime evidence can populate shared entity facts without re-identifying the event', () => {
  const { payload } = workflowActionEventToRuntimeEvidence(completed);
  const facts = extractRuntimeEvidenceEntities({
    evidence_id: 'evidence:workflow:742:17',
    evidence_kind: 'runtime',
    source_ref: 'workflow://graphify/742',
    source_revision: 'workflow-r742',
    evidence_revision: 'event-r17',
    workspace_revision: 'ws-742',
    payload,
  }, 'runtime-evidence-r1');

  assert.equal(facts.some((item) => item.entity_id === completed.actionId), true);
  assert.equal(facts.some((item) => item.entity_id === completed.receiptId), true);
  assert.equal(facts.some((item) => item.entity_id === 'table:atlas_symbol_registry'), true);
});
