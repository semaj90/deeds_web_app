import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  recordAgenticRunReceipt,
  updateJsonlWithReceipt,
  updateTasksWithReceipt,
  validateRecordableWorkflowAction
} from './record-agentic-run-receipt.mjs';

function event(overrides = {}) {
  return {
    schema: 'atlas.workflow-action.v1',
    workflowId: 'wf-1',
    workflowRevision: 1,
    sequence: 7,
    actionId: 'agent-7',
    dagNodeId: 'node-7',
    attempt: 1,
    lane: 'a2a',
    kind: 'completed',
    state: 'succeeded',
    operation: 'prove bounded agent task',
    tokensUsed: 1200,
    filesEdited: ['src/a.ts', 'src/b.ts'],
    openspecChange: 'test-agentic-receipts',
    startedAt: '2026-08-29T20:00:00.000Z',
    emittedAt: '2026-08-29T20:00:02.000Z',
    finishedAt: '2026-08-29T20:00:02.000Z',
    ...overrides
  };
}

test('recorder-specific admission rejects non-agent or unsuccessful events', () => {
  assert.throws(() => validateRecordableWorkflowAction(event({ lane: 'tool' })), /lane=acp or lane=a2a/);
  assert.throws(() => validateRecordableWorkflowAction(event({ state: 'failed' })), /state=succeeded/);
  assert.throws(() => validateRecordableWorkflowAction(event({ openspecChange: '../escape' })), /safe OpenSpec slug/);
});

test('task and JSONL transforms are idempotent on workflow/action/sequence', () => {
  const value = event();
  const firstTasks = updateTasksWithReceipt('# Tasks\n', value);
  assert.equal(firstTasks.changed, true);
  assert.match(firstTasks.text, /## Run Receipts/);
  assert.equal(updateTasksWithReceipt(firstTasks.text, value).changed, false);

  const firstLedger = updateJsonlWithReceipt('', value);
  assert.equal(firstLedger.changed, true);
  assert.equal(updateJsonlWithReceipt(firstLedger.text, value).changed, false);
});

test('dry run does not mutate OpenSpec and apply is idempotent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'atlas-agent-receipt-'));
  try {
    const changeRoot = join(root, 'openspec', 'changes', 'test-agentic-receipts');
    await mkdir(changeRoot, { recursive: true });
    await writeFile(join(changeRoot, 'tasks.md'), '# Tasks\n\n- [ ] Existing\n', 'utf8');

    const dry = await recordAgenticRunReceipt({ repoRoot: root, event: event(), dryRun: true });
    assert.equal(dry.changed, true);
    assert.equal(await readFile(join(changeRoot, 'tasks.md'), 'utf8'), '# Tasks\n\n- [ ] Existing\n');

    const applied = await recordAgenticRunReceipt({ repoRoot: root, event: event() });
    assert.equal(applied.changed, true);
    const second = await recordAgenticRunReceipt({ repoRoot: root, event: event() });
    assert.equal(second.changed, false);
    const ledger = await readFile(join(changeRoot, 'receipts.jsonl'), 'utf8');
    assert.equal(ledger.trim().split(/\r?\n/u).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
