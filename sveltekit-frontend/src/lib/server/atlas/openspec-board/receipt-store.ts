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
  let raw: string;
  try {
    raw = await fs.readFile(await receiptsPath(dir), 'utf8');
  } catch {
    return last;
  }
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = TaskAttemptReceiptV1Schema.safeParse(JSON.parse(line));
      if (parsed.success) last.set(parsed.data.logicalTaskKey, parsed.data);
    } catch {
      /* skip malformed line */
    }
  }
  return last;
}
