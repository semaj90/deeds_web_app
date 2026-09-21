// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendTaskAttemptReceipt, readLastTaskAttemptReceipts, TASK_ATTEMPT_RECEIPTS_FILE } from './receipt-store';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'receipts-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const blocked = {
  logicalTaskKey: 'change#abc',
  taskRevision: 'sha256:1',
  result: 'BLOCKED',
  blockerClass: 'IDENTITY_SOURCE_REVISION_GATED',
  missingPreconditions: ['CURRENT_SOURCE_AUTHORITY_PROVEN'],
};

describe('receipt-store', () => {
  it('returns an empty map when no file exists', async () => {
    expect((await readLastTaskAttemptReceipts(dir)).size).toBe(0);
  });

  it('appends validated receipts as JSONL and reads the latest per task', async () => {
    await appendTaskAttemptReceipt(blocked, dir);
    await appendTaskAttemptReceipt(
      { ...blocked, taskRevision: 'sha256:2', result: 'COMPLETED', blockerClass: 'NONE', missingPreconditions: [], validationsPassed: ['tsgo'] },
      dir,
    );
    const lines = (await readFile(join(dir, TASK_ATTEMPT_RECEIPTS_FILE), 'utf8')).trim().split('\n');
    expect(lines).toHaveLength(2);
    const last = await readLastTaskAttemptReceipts(dir);
    expect(last.get('change#abc')?.result).toBe('COMPLETED');
  });

  it('rejects an invalid receipt without writing anything', async () => {
    await expect(appendTaskAttemptReceipt({ ...blocked, blockerClass: 'NONE' }, dir)).rejects.toThrow();
    expect((await readLastTaskAttemptReceipts(dir)).size).toBe(0);
  });

  it('ignores malformed lines', async () => {
    await writeFile(join(dir, TASK_ATTEMPT_RECEIPTS_FILE), 'not json\n', 'utf8');
    await appendTaskAttemptReceipt(blocked, dir);
    expect((await readLastTaskAttemptReceipts(dir)).size).toBe(1);
  });
});
