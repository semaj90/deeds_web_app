import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCensus, taskCounts } from './build-openspec-artifact-census-v1.mjs';

test('task counts keep heuristic supersession separate from confirmation', () => {
  const counts = taskCounts({
    summary: { actionableTasks: 2, waitingTasks: 3, completedTasks: 4, supersededTasks: 5, totalTasks: 14 },
    taskInventory: [{ gateState: 'REVIEW_REQUIRED' }],
    controllerEvidence: { staleOrMissingTaskCount: 6 },
  });
  assert.deepEqual(counts, {
    current: 2,
    waiting: 3,
    checked: 4,
    superseded: 0,
    supersessionReviewCandidates: 5,
    reviewRequired: 1,
    staleOrMissingControllerEvidence: 6,
    total: 14,
  });
});

test('census conservatively keeps reports local and retrieval history opt-in', () => {
  const census = buildCensus({
    schema: 'atlas.openspec.workboard.v1',
    generatedAt: '2026-10-03T17:03:38.817Z',
    sourceFileHashes: { 'openspec/changes/example/tasks.md': 'sha256:abc' },
    summary: { actionableTasks: 1, waitingTasks: 2, completedTasks: 3, supersededTasks: 4, totalTasks: 10 },
    taskInventory: [],
    controllerEvidence: { generatedAt: '2026-09-26T17:08:37.551Z' },
  }, [['report.json', 123]], 'sha256:population', 'revision');
  assert.equal(census.tasks.superseded, 0);
  assert.equal(census.reports.coldCandidate, 0);
  assert.equal(census.reports.reviewRequired, 1);
  assert.equal(census.bytes.local, 123);
  assert.deepEqual(census.retrieval.defaults, ['CURRENT', 'WAITING', 'REVIEW_REQUIRED']);
  assert.deepEqual(census.retrieval.historyOnly, ['SUPERSEDED', 'HISTORICAL']);
  assert.equal(census.sourceWorkboard.controllerEvidenceFreshness, 'STALE');
  assert.equal(census.writesPerformed, false);
});
