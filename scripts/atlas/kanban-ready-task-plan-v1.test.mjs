import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKanbanReadyTaskPlanV1 } from './kanban-ready-task-plan-v1.mjs';

test('builds a bounded read-only plan and omits executable commands', () => {
  const plan = buildKanbanReadyTaskPlanV1([
    { task_id: 'task-1', feature_id: 'openspec:x', feature_label: 'X', lane: 'todo', status: 'pending', priority: 2, attempt_count: 0, validation_command: 'unsafe command' },
  ], 5, 'openspec:example-change');
  assert.equal(plan.status, 'PLAN_ONLY');
  assert.equal(plan.cohort, 'openspec:example-change');
  assert.equal(plan.writesPerformed, false);
  assert.equal(plan.commandsExecuted, false);
  assert.equal(plan.readyCount, 1);
  assert.equal('validation_command' in plan.tasks[0], false);
});

test('rejects out-of-range batches, oversized results, and duplicate task IDs', () => {
  assert.throws(() => buildKanbanReadyTaskPlanV1([], 0, 'openspec:test'), /BATCH_SIZE_OUT_OF_RANGE/);
  assert.throws(() => buildKanbanReadyTaskPlanV1([], 26, 'openspec:test'), /BATCH_SIZE_OUT_OF_RANGE/);
  assert.throws(() => buildKanbanReadyTaskPlanV1([{ task_id: 'a' }, { task_id: 'b' }], 1, 'openspec:test'), /ROWS_INVALID/);
  assert.throws(() => buildKanbanReadyTaskPlanV1([{ task_id: 'a' }, { task_id: 'a' }], 2, 'openspec:test'), /ID_INVALID_OR_DUPLICATE/);
  assert.throws(() => buildKanbanReadyTaskPlanV1([], 5, 'all'), /COHORT_REQUIRED_OR_INVALID/);
});
