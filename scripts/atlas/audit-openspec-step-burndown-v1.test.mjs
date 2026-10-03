import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDependencyDisposition as classify, buildBurndown } from './audit-openspec-step-burndown-v1.mjs';

const t = (declared, extra = {}) => ({ taskKey: 'c:1', change: 'c', state: 'OPEN', executionState: 'ACTIONABLE', lane: 'GENERAL', declared, ...extra });

test('resolved zero-gate declaration -> READY_DECLARED', () => {
  assert.equal(classify(t({ dependsOn: ['A'], unresolvedDepends: [], ambiguousDepends: [] }, { dependsOnTaskIds: ['c:0'], remainingRequiredGates: 0 })), 'READY_DECLARED');
});
test('resolved with remaining gates -> WAITING_DECLARED', () => {
  assert.equal(classify(t({ dependsOn: ['A'], unresolvedDepends: [], ambiguousDepends: [] }, { dependsOnTaskIds: ['c:0'], remainingRequiredGates: 2 })), 'WAITING_DECLARED');
});
test('unresolved -> UNRESOLVED_DEPENDENCY', () => {
  assert.equal(classify(t({ dependsOn: ['X'], unresolvedDepends: ['X'], ambiguousDepends: [] })), 'UNRESOLVED_DEPENDENCY');
});
test('ambiguous -> AMBIGUOUS_DEPENDENCY', () => {
  assert.equal(classify(t({ dependsOn: ['X'], unresolvedDepends: [], ambiguousDepends: ['X'] })), 'AMBIGUOUS_DEPENDENCY');
});
test('cycle -> DEPENDENCY_CYCLE (wins over other flags)', () => {
  assert.equal(classify(t({ dependsOn: ['A'], dependencyState: 'CYCLE_OR_DOWNSTREAM_OF_CYCLE', unresolvedDepends: ['A'] })), 'DEPENDENCY_CYCLE');
});
test('absent declaration -> MISSING_DEPENDENCY_METADATA, never READY', () => {
  assert.equal(classify(t(undefined)), 'MISSING_DEPENDENCY_METADATA');
  assert.equal(classify(t(null)), 'MISSING_DEPENDENCY_METADATA');
  assert.equal(classify(t({ dependsOn: null })), 'MISSING_DEPENDENCY_METADATA');
});

test('buildBurndown reconciles a tiny workboard and flags a broken one', () => {
  const tasks = [
    { taskKey: 'c:1', change: 'c', state: 'DONE', executionState: 'DONE', lane: 'GENERAL', declared: null },
    t(null, { taskKey: 'c:2' }),
    t({ dependsOn: ['A'], unresolvedDepends: [], ambiguousDepends: [] }, { taskKey: 'c:3', dependsOnTaskIds: ['c:1'], remainingRequiredGates: 0, logicalTaskKey: 'c:3' }),
  ];
  const wb = { schema: 'atlas.openspec.workboard.v1', generatedAt: 'x', summary: { totalTasks: 3, completedTasks: 1, openTasks: 2 }, taskInventory: tasks, executionSteps: [{ id: 'STEP-01', title: 't', gate: 'g', total: 3, completed: 1, open: 2, taskKeys: ['c:1', 'c:2', 'c:3'] }] };
  const ok = buildBurndown(wb);
  assert.equal(ok.validation.allPass, true);
  assert.equal(ok.steps[0].openByDependencyDisposition.READY_DECLARED, 1);
  assert.equal(ok.steps[0].openByDependencyDisposition.MISSING_DEPENDENCY_METADATA, 1);
  assert.equal(ok.steps[0].classifierActionableWithoutDependencyMetadata, 1);
  const bad = buildBurndown({ ...wb, summary: { ...wb.summary, openTasks: 3 } });
  assert.equal(bad.validation.allPass, false);
});

test('schema guard rejects an unsupported workboard', () => {
  assert.throws(() => buildBurndown({ schema: 'other', taskInventory: [], executionSteps: [] }), /WORKBOARD_SCHEMA_UNSUPPORTED/);
});
