import test from 'node:test';
import assert from 'node:assert/strict';
import { selectKanbanDagPrefillAlgorithm } from './kanban-dag-algorithm-selector-v1.mjs';

const featureId = 'openspec:parent-atlas-agentic-file-compiler';
const snapshotHash = 'a'.repeat(64);

function snapshot(tasks, dependencies = []) {
  return {
    schema: 'atlas.kanban-task-dag-snapshot.v1',
    status: 'READY',
    featureId,
    snapshotAt: '2026-11-02T00:00:00.000Z',
    snapshotHash,
    tasks: tasks.map((taskId, index) => ({
      taskId,
      featureLabel: `Task ${taskId}`,
      lane: 'todo',
      status: 'pending',
      priority: index,
      sourceRefs: [`openspec/changes/${featureId.slice('openspec:'.length)}/tasks.md`]
    })),
    dependencies,
    sourceAuthority: 'KANBAN_TASKS_POSTGRES_READ_ONLY_SNAPSHOT',
    canonicalAuthority: false,
    writesPerformed: false
  };
}

test('independent Kanban tasks use stable task IDs without assuming priority direction', () => {
  const result = selectKanbanDagPrefillAlgorithm(snapshot(['task-b', 'task-a']));
  assert.equal(result.status, 'PROPOSED');
  assert.equal(result.algorithm, 'STABLE_READY_SET');
  assert.deepEqual(result.readyTaskIds, ['task-a', 'task-b']);
  assert.equal(result.priorityFieldUsed, false);
  assert.equal(result.readyCandidates[0].sourceRefsValidated, false);
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.writesPerformed, false);
});

test('branching dependency graph uses deterministic Kahn frontiers and exposes bounded ready tasks', () => {
  const result = selectKanbanDagPrefillAlgorithm(snapshot(
    ['task-a', 'task-b', 'task-c', 'task-d'],
    [
      { parentTaskId: 'task-a', childTaskId: 'task-c' },
      { parentTaskId: 'task-b', childTaskId: 'task-d' }
    ]
  ), { maxPrefillTasks: 2 });
  assert.equal(result.algorithm, 'KAHN_TOPOLOGICAL_READY_FRONTIERS');
  assert.deepEqual(result.topologicalLayers, [['task-a', 'task-b'], ['task-c', 'task-d']]);
  assert.deepEqual(result.readyTaskIds, ['task-a', 'task-b']);
  assert.equal(result.omittedReadyTaskCount, 0);
  assert.equal(result.graphProfile.parallelExecutionAuthorized, false);
});

test('a narrow dependency chain uses stable topological order and completed parents unlock the next task', () => {
  const data = snapshot(
    ['task-a', 'task-b', 'task-c'],
    [
      { parentTaskId: 'task-a', childTaskId: 'task-b' },
      { parentTaskId: 'task-b', childTaskId: 'task-c' }
    ]
  );
  data.tasks[0] = { ...data.tasks[0], lane: 'done', status: 'completed' };
  const result = selectKanbanDagPrefillAlgorithm(data);
  assert.equal(result.algorithm, 'KAHN_STABLE_TOPOLOGICAL_ORDER');
  assert.deepEqual(result.topologicalOrder, ['task-a', 'task-b', 'task-c']);
  assert.deepEqual(result.readyTaskIds, ['task-b']);
});

test('cycles and edges outside the cohort fail closed', () => {
  const cycle = selectKanbanDagPrefillAlgorithm(snapshot(
    ['task-a', 'task-b'],
    [
      { parentTaskId: 'task-a', childTaskId: 'task-b' },
      { parentTaskId: 'task-b', childTaskId: 'task-a' }
    ]
  ));
  assert.equal(cycle.status, 'BLOCKED');
  assert.equal(cycle.reasonCode, 'DEPENDENCY_CYCLE');

  const outside = selectKanbanDagPrefillAlgorithm(snapshot(
    ['task-a'],
    [{ parentTaskId: 'other-cohort-task', childTaskId: 'task-a' }]
  ));
  assert.equal(outside.status, 'BLOCKED');
  assert.equal(outside.reasonCode, 'DEPENDENCY_EDGE_INVALID_OR_OUT_OF_COHORT');
});

test('unavailable or empty snapshots never appear as successful empty recommendations', () => {
  const unavailable = selectKanbanDagPrefillAlgorithm({
    schema: 'atlas.kanban-task-dag-snapshot.v1',
    status: 'BLOCKED',
    reasonCode: 'KANBAN_SNAPSHOT_UNAVAILABLE',
    featureId,
    canonicalAuthority: false,
    writesPerformed: false
  });
  assert.equal(unavailable.status, 'BLOCKED');
  assert.equal(unavailable.reasonCode, 'KANBAN_SNAPSHOT_UNAVAILABLE');
  assert.equal(selectKanbanDagPrefillAlgorithm({
    schema: 'atlas.kanban-task-dag-snapshot.v1',
    status: 'EMPTY',
    featureId,
    tasks: [],
    dependencies: [],
    canonicalAuthority: false,
    writesPerformed: false,
  }).reasonCode, 'SNAPSHOT_EMPTY_COHORT');
});

test('snapshot validation rejects unknown fields, malformed hashes, and invalid task rows', () => {
  const extra = selectKanbanDagPrefillAlgorithm({ ...snapshot(['task-a']), unexpected: true });
  assert.equal(extra.reasonCode, 'SNAPSHOT_CONTRACT_INVALID');

  const badHash = snapshot(['task-a']);
  badHash.snapshotHash = 'A'.repeat(64);
  assert.equal(selectKanbanDagPrefillAlgorithm(badHash).reasonCode, 'SNAPSHOT_CONTRACT_INVALID');

  const invalidTask = snapshot(['task-a']);
  invalidTask.tasks[0].taskId = '';
  assert.equal(selectKanbanDagPrefillAlgorithm(invalidTask).reasonCode, 'SNAPSHOT_CONTRACT_INVALID');
});
