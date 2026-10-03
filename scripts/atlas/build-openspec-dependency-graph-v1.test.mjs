import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOpenSpecDependencyGraphV1 } from './build-openspec-dependency-graph-v1.mjs';

test('keeps whole-file references unresolved and out of task edges', () => {
  const graph = buildOpenSpecDependencyGraphV1({
    schema: 'atlas.openspec-evidence-portfolio-census.v2',
    source: { workspaceRevision: 'sha256:workspace' },
    tasks: [{ canonicalTaskRef: 'task-a', taskRef: 'tasks.md#L1', changeId: 'a', authorityScope: 'openspec://root' }],
    dependencies: [],
    missingTaskReferences: [],
    changeLevelReferences: [{
      fromTaskKey: 'task-a',
      reference: 'openspec/changes/change-b/tasks.md',
      relation: 'REQUIRES',
      taskRef: 'tasks.md#L1',
      status: 'CHANGE_LEVEL_REFERENCE',
      detail: 'TASKS_FILE_REFERENCE_WITHOUT_TASK_ANCHOR',
    }],
  });

  assert.equal(graph.edges.length, 0);
  assert.equal(graph.summary.unresolvedEdgeCount, 1);
  assert.equal(graph.unresolvedEdges[0].status, 'CHANGE_LEVEL_REFERENCE');
});
