import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { blockHash, taskBlock } from './wfu-metadata.mjs';
import { extractNextStepObservationV1 } from './openspec-next-step-observations-v1.mjs';

const digest = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const makeTask = (sourceText, line = 1) => ({
  source: 'openspec/changes/sample/tasks.md', line, taskKey: 'sample:1',
  blockHash: blockHash(taskBlock(sourceText.split(/\r?\n/), line - 1)), state: 'OPEN', executionState: 'OPEN',
});

test('extracts explicit task fields with exact UTF-8 spans and stable ordering', () => {
  const text = '- [ ] **T-01** Handle café\r\n  owner: team-a\r\n  dependency: `T-00`\r\n  blocker: none\r\n  proof: `docs/reports/a.json`\r\n  safe_next_command: `npm test`\r\n';
  const task = makeTask(text);
  const first = extractNextStepObservationV1({ task, sourceText: text, expectedTaskFileSha256: digest(text) });
  const second = extractNextStepObservationV1({ task, sourceText: text, expectedTaskFileSha256: digest(text) });
  assert.deepEqual(first, second);
  assert.deepEqual(first.observations.map(item => item.field), [
    'authoredCheckboxStatus', 'owner', 'dependency', 'blocker', 'proof', 'safeNextCommand',
  ]);
  for (const item of first.observations) {
    const bytes = Buffer.from(text, 'utf8').subarray(item.startByte, item.endByte);
    assert.equal(bytes.toString('utf8'), item.evidenceText);
    assert.equal(digest(bytes), item.evidenceSha256);
  }
  assert.equal(first.observations.find(item => item.field === 'safeNextCommand').value, 'npm test');
  assert.equal(first.workspaceRevision, null);
});

test('fails closed on file and task-block revision mismatch', () => {
  const text = '- [x] **T-01** done';
  const task = makeTask(text);
  assert.throws(() => extractNextStepObservationV1({ task, sourceText: `${text}!`, expectedTaskFileSha256: digest(text) }), /SOURCE_REVISION_MISMATCH/);
  assert.throws(() => extractNextStepObservationV1({ task: { ...task, blockHash: digest('other') }, sourceText: text, expectedTaskFileSha256: digest(text) }), /TASK_BLOCK_MISMATCH/);
});

test('does not turn unlabelled prose or child checklist fields into evidence', () => {
  const text = '- [ ] **T-01** evidence should be collected\n  - [ ] **T-02** proof: invented child value\n  plain prose safe_next_command: not a field label\n';
  const task = makeTask(text);
  const result = extractNextStepObservationV1({ task, sourceText: text, expectedTaskFileSha256: digest(text) });
  assert.deepEqual(result.observations.map(item => item.field), ['authoredCheckboxStatus']);
});
