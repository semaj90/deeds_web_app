import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyWorkboardTaskV1,
  workboardEvidenceDispositionV1,
} from './workboard-task-classification-v1.mjs';

const convergence = 'parent-atlas-retrieval-lineage-dag-convergence';

test('supersession language is review-only without task revision replacement evidence', () => {
  for (const text of [
    'This task is superseded by the new flow',
    'Historical migration task',
    'Archive the retired task after replacement',
  ]) {
    const classification = classifyWorkboardTaskV1(convergence, text, convergence);
    assert.equal(classification, 'SUPERSESSION_REVIEW_REQUIRED');
    assert.equal(workboardEvidenceDispositionV1(classification, text), 'SUPERSESSION_REPLACEMENT_EVIDENCE_REQUIRED');
  }
});

test('negative constraints take precedence over supersession keywords', () => {
  const text = 'Do not mark this task superseded without exact replacement evidence';
  assert.equal(classifyWorkboardTaskV1(convergence, text, convergence), 'NEGATIVE_CONSTRAINT');
});

test('a change-level or prose mention cannot classify a task as superseded', () => {
  assert.notEqual(classifyWorkboardTaskV1(convergence, 'Superseded by another task', convergence), 'SUPERSEDED');
});
