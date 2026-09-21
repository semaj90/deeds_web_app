#!/usr/bin/env node
import fs from 'node:fs';

const reports = 'docs/reports';
const read = (name) => JSON.parse(fs.readFileSync(`${reports}/${name}`, 'utf8'));
const controller = read('openspec-execution-controller-v1.json');
const audit = read('openspec-actionable-lane-audit-v2.json');
const ranker = read('actionable-workboard-v3.json');
const authorityReview = read('openspec-authority-text-review-v1.json');

const controllerActionable = controller.allTasks.filter((task) => task.controller?.state === 'ACTIONABLE');
if (controller.allTasks.length !== controller.summary.totalTasks) {
  throw new Error(`full controller population mismatch: ${controller.allTasks.length}/${controller.summary.totalTasks}`);
}
if (controllerActionable.length !== controller.summary.actionable) {
  throw new Error(`controller actionable mismatch: ${controllerActionable.length}/${controller.summary.actionable}`);
}
if (audit.summary.controllerActionableObjectsFound !== controller.summary.actionable) {
  throw new Error('readiness audit did not consume the full controller actionable population');
}
if (audit.summary.exportTruncationDetected) {
  throw new Error('readiness audit still reports a truncated actionable export');
}
if (ranker.tasks.length !== controller.summary.actionable) {
  throw new Error(`ranker task count mismatch: ${ranker.tasks.length}/${controller.summary.actionable}`);
}
for (let i = 0; i < ranker.tasks.length; i++) {
  if (ranker.tasks[i].rank !== i + 1) throw new Error(`rank gap at ${i + 1}`);
  if (ranker.tasks[i].executionState !== 'ACTIONABLE') throw new Error(`non-actionable task ranked: ${ranker.tasks[i].id}`);
}
if (ranker.tasks[0]?.lane !== 'IDENTITY_AUTHORITY' || ranker.tasks[0]?.readOnly !== true) {
  throw new Error('ranker did not prefer the read-only authority spine');
}
const reviewKeys = new Set((authorityReview.tasks ?? [])
  .filter((task) => task.recommendedDisposition === 'REVIEW_BEFORE_SELECTION')
  .map((task) => task.taskKey));
for (const task of ranker.tasks) {
  if (reviewKeys.has(task.id) && task.selectionEligible !== false) {
    throw new Error(`authority-review task remained selection eligible: ${task.id}`);
  }
}
console.log(`openspec-actionable-v3: ${ranker.tasks.length} actionable tasks, full-population and rank-order checks PASS`);
