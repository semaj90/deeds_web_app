/**
 * Append-only store for TaskAttemptReceiptV1 (WORKBOARD-05, parent-atlas-retrieval-staging-planes).
 *
 * One JSON object per line in `task-attempt-receipts-v1.jsonl` inside the OpenSpec reports
 * directory (the same directory `readOpenSpecBoardSnapshot()` reads). Advisory bookkeeping only:
 * receipts never mark a task done and never touch tasks.md.
 *
 * `logicalTaskKey` should be the board task's `stableKey` (see `openspec:workboard_recommend`).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  TaskAttemptReceiptV1Schema,
  type TaskAttemptReceiptV1,
} from '../contracts/task-attempt-receipt-v1';
import { resolveOpenSpecReportDirectory } from './report-reader';

export const TASK_ATTEMPT_RECEIPTS_FILE = 'task-attempt-receipts-v1.jsonl';

async function receiptsPath(dir?: string): Promise<string> {
  return path.join(dir ?? (await resolveOpenSpecReportDirectory()), TASK_ATTEMPT_RECEIPTS_FILE);
}

/** Validates (throws on an invalid receipt) then appends one line. Returns the stored receipt. */
export async function appendTaskAttemptReceipt(
  input: unknown,
  dir?: string,
): Promise<TaskAttemptReceiptV1> {
  const receipt = TaskAttemptReceiptV1Schema.parse(input);
  await fs.appendFile(await receiptsPath(dir), JSON.stringify(receipt) + '\n', 'utf8');
  return receipt;
}

/** Latest receipt per logicalTaskKey. Missing file or malformed lines are ignored (fail open). */
export async function readLastTaskAttemptReceipts(
  dir?: string,
): Promise<Map<string, TaskAttemptReceiptV1>> {
  const last = new Map<string, TaskAttemptReceiptV1>();
  for await (const receipt of readAttemptReceipts(dir)) last.set(receipt.logicalTaskKey, receipt);
  return last;
}

async function* readAttemptReceipts(dir?: string) {
  let raw: string;
  try {
    raw = await fs.readFile(await receiptsPath(dir), 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = TaskAttemptReceiptV1Schema.safeParse(JSON.parse(line));
      if (parsed.success) yield parsed.data;
    } catch {
      /* skip malformed line */
    }
  }
}

/** Preserve an older matching attempt when a later append belongs to a different revision. */
export async function readTaskAttemptReceiptForRevision(keys: readonly string[], revision: string, dir?: string) {
  const aliases = new Set(keys);
  let current: TaskAttemptReceiptV1 | null = null;
  let staleCount = 0;
  for await (const receipt of readAttemptReceipts(dir)) {
    if (!aliases.has(receipt.logicalTaskKey)) continue;
    if (receipt.taskRevision === revision) current = receipt;
    else staleCount++;
  }
  return { current, staleCount };
}
