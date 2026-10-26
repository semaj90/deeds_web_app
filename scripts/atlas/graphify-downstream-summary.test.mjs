import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizePipelineStages } from './graphify-downstream-summary.mjs';

test('pipeline summary rejects timeout and failed stages in dry-run reports', () => {
  assert.deepEqual(
    summarizePipelineStages({
      graphify_readiness_check: { status: 'timeout' },
      kanban_emit: { status: 'fail' }
    }),
    { success: false, failedStages: ['graphify_readiness_check', 'kanban_emit'] }
  );
});

test('pipeline summary accepts passed stages and skipped optional stages', () => {
  assert.deepEqual(
    summarizePipelineStages({
      graphify_readiness_check: { status: 'pass' },
      pagerank: { status: 'skipped' },
      kanban_emit: { status: 'pass' }
    }),
    { success: true, failedStages: [] }
  );
});
