import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCrosswalk } from './crosswalk-lowrank-cohort-to-tasks-v1.mjs';

const task = (source, line, text, stableKey, state = 'OPEN') => ({ source, line, text, stableKey, state });
const A = 'openspec/changes/a/tasks.md';
const workboard = {
  sourceFileHashes: { [A]: 'sha256:x' },
  taskInventory: [
    task(A, 3, '- [ ] first task', 'a#1111111111111111'),
    task(A, 5, '- [x] second task', 'a#2222222222222222', 'DONE'),
    task(A, 7, '- [ ] twin', 'a#3333333333333333'),
    task(A, 9, '- [ ] twin', 'a#4444444444444444'),
  ],
};
const files = {
  [A]: ['# t', '', '- [ ] first task', '', '- [x] second task', '', '- [ ] twin', '', '- [ ] twin', '- [ ] brand new', 'prose line',
    '- [ ] inserted above', '- [ ] moved task'],
};
const readLines = (f) => files[f] ?? null;
const rows = (ids) => ids.map((task_id) => ({ task_id }));
const run = (ids) => buildCrosswalk({ cohortRows: rows(ids), workboard, readLines });
const status = (id) => run([id]).rows[0];

test('exact path+line+text match resolves to the stableKey and carries the workboard state', () => {
  const r = status(`${A}#L3`);
  assert.deepEqual([r.status, r.stableKey, r.workboardState], ['MATCHED_EXACT', 'a#1111111111111111', 'OPEN']);
  assert.equal(status(`${A}#L5`).workboardState, 'DONE');
});

test('a drifted line is resolved by text only when exactly one workboard task has that text', () => {
  files[A][9] = '- [ ] first task'; // current text at line 10 equals the first task, which the workboard has at line 3
  const r = status(`${A}#L10`);
  assert.deepEqual([r.status, r.stableKey], ['RESOLVED_BY_TEXT', 'a#1111111111111111']);
  files[A][9] = '- [ ] brand new';
});

test('duplicate task text is AMBIGUOUS_TEXT, never silently picked', () => {
  files[A][11] = '- [ ] twin';
  const r = status(`${A}#L12`);
  assert.equal(r.status, 'AMBIGUOUS_TEXT');
  assert.equal(r.stableKey, null);
  assert.deepEqual(r.candidates.sort(), ['a#3333333333333333', 'a#4444444444444444']);
  files[A][11] = '- [ ] inserted above';
});

test('a covered file with a task the workboard lacks is NEW_SINCE_WORKBOARD (no id minted)', () => {
  const r = status(`${A}#L10`);
  assert.deepEqual([r.status, r.stableKey], ['NEW_SINCE_WORKBOARD', null]);
});

test('same line, changed text, no unique match is LINE_DRIFT_UNRESOLVED', () => {
  files[A][2] = '- [ ] first task, reworded';
  assert.equal(status(`${A}#L3`).status, 'LINE_DRIFT_UNRESOLVED');
  files[A][2] = '- [ ] first task';
});

test('a file the workboard does not cover is FILE_NOT_IN_WORKBOARD', () => {
  const other = 'sveltekit-frontend/openspec/changes/b/tasks.md';
  files[other] = ['- [ ] some task'];
  const r = status(`${other}#L1`);
  assert.deepEqual([r.status, r.stableKey], ['FILE_NOT_IN_WORKBOARD', null]);
  delete files[other];
});

test('missing file, non-task line and non-line identity are labelled, not guessed', () => {
  assert.equal(status('openspec/changes/gone/tasks.md#L1').status, 'SOURCE_FILE_MISSING');
  assert.equal(status(`${A}#L11`).status, 'SOURCE_LINE_NOT_A_TASK');
  assert.equal(status(`${A}#L999`).status, 'SOURCE_LINE_NOT_A_TASK');
  assert.equal(status('task:ordinal:7').status, 'NON_LINE_IDENTITY');
});

test('ordinal is the row index, summary is consistent, and duplicate stableKeys are reported', () => {
  const out = run([`${A}#L3`, `${A}#L5`, `${A}#L3`]);
  assert.deepEqual(out.rows.map((r) => r.ordinal), [0, 1, 2]);
  assert.equal(out.summary.cohortRows, 3);
  assert.equal(out.summary.uniqueTaskIds, 2);
  assert.equal(out.summary.resolvedToStableKey, 3);
  assert.equal(out.summary.duplicateStableKeys, 1);
});
