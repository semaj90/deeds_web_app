import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getOpenSpecClosureBlockersV1 as closureBlockers,
  validateDocumentGovernanceOpenSpecBindingsV1 as validate,
} from './document-governance-openspec-binding-v1.mjs';

const taskRecord = (overrides = {}) => ({
  path: 'openspec/changes/example/tasks.md',
  documentKind: 'OPENSPEC_TASKS',
  openspec: { change: 'example', completedTasks: 1, totalTasks: 2, progressFraction: 0.5 },
  ...overrides,
});

test('accepts task ledgers bound through current nested registry fields', () => {
  const result = validate([taskRecord()]);
  assert.equal(result.status, 'PROVEN_BOUNDED');
  assert.equal(result.boundTaskLedgers, 1);
  assert.equal(result.openTasks, 1);
  assert.equal(result.incompleteTaskLedgers, 1);
  assert.deepEqual(result.failures, []);
});

test('reports missing OpenSpec binding rather than reading obsolete flat fields', () => {
  const result = validate([taskRecord({ openspec: { change: null, completedTasks: 1, totalTasks: 2, progressFraction: 0.5 } })]);
  assert.deepEqual(result.failures, ['OPENSPEC_BINDING_MISSING:openspec/changes/example/tasks.md']);
  assert.equal(result.unboundTaskLedgers, 1);
});

test('fails closed on invalid progress counts or fraction', () => {
  const invalidCounts = validate([taskRecord({ openspec: { change: 'example', completedTasks: 3, totalTasks: 2, progressFraction: 1.5 } })]);
  assert.deepEqual(invalidCounts.failures, ['OPENSPEC_TASK_PROGRESS_INVALID:openspec/changes/example/tasks.md']);
  const invalidFraction = validate([taskRecord({ openspec: { change: 'example', completedTasks: 1, totalTasks: 2, progressFraction: 0.9 } })]);
  assert.deepEqual(invalidFraction.failures, ['OPENSPEC_PROGRESS_FRACTION_MISMATCH:openspec/changes/example/tasks.md']);
});

test('does not classify ordinary documents as missing OpenSpec bindings', () => {
  const result = validate([{ path: 'docs/guide.md', documentKind: 'DOCUMENT', openspec: { change: null } }]);
  assert.equal(result.status, 'PROVEN_BOUNDED');
  assert.equal(result.taskLedgers, 0);
});

test('keeps implementation closure blocked while any tracked task is open', () => {
  assert.deepEqual(closureBlockers({ openTasks: 2 }), ['UNCHECKED_TASKS:2']);
  assert.deepEqual(closureBlockers({ openTasks: 0 }), []);
});
