import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { resolveOpenSpecReportDirectory } from './report-reader.js';
import { readTaskAttemptReceiptForRevision } from './receipt-store.js';
import { loadOpenSpecWorkboardV1 } from './workboard-contract-v1.js';

export async function readOpenSpecTaskReceiptView(taskKey: string, reportDirectory?: string) {
  if (!taskKey || taskKey.length > 512) return { status: 'INVALID_KEY' } as const;
  try {
    const reports = reportDirectory ?? await resolveOpenSpecReportDirectory();
    const root = await realpath(path.resolve(reports, '../..'));
    const artifact = process.env.ATLAS_OPENSPEC_WORKBOARD_PATH;
    const { workboard, revision } = await loadOpenSpecWorkboardV1(artifact
      ? path.resolve(root, artifact)
      : path.join(reports, 'openspec-workboard-v1.json'));
    const matches = workboard.taskInventory.filter((task) =>
      task.logicalTaskKey === taskKey || task.stableKey === taskKey || task.taskKey === taskKey);
    if (matches.length !== 1) return { status: matches.length ? 'AMBIGUOUS' : 'NOT_FOUND' } as const;
    const [task] = matches;
    if (!task.source.startsWith('openspec/') || !task.source.endsWith('/tasks.md') ||
      task.source.split('/').some((segment) => !segment || segment === '..' || segment === '.')) {
      return { status: 'UNAVAILABLE' } as const;
    }
    const sourcePath = await realpath(path.resolve(root, task.source));
    const relativeSource = path.relative(root, sourcePath).replaceAll('\\', '/');
    if (relativeSource !== task.source) return { status: 'UNAVAILABLE' } as const;
    const source = await readFile(sourcePath, 'utf8');
    const sourceHash = `sha256:${createHash('sha256').update(source).digest('hex')}`;
    const hashes = workboard.sourceFileHashes as Record<string, unknown> | undefined;
    const checkbox = /^\s*[-*+]\s*\[([ xX~])\]\s+/.exec(source.split(/\r?\n/)[task.line - 1] ?? '')?.[1];
    if (!checkbox || !Object.hasOwn(hashes ?? {}, task.source) || hashes?.[task.source] !== sourceHash ||
      !/^sha256:[a-f0-9]{64}$/.test(task.blockHash)) return { status: 'STALE_SNAPSHOT' } as const;
    const keys = task.logicalTaskKey ? [task.logicalTaskKey, task.stableKey] : [task.stableKey];
    const attempts = await readTaskAttemptReceiptForRevision(keys, task.blockHash, reports);
    return {
      status: 'FOUND' as const,
      task: {
        key: task.logicalTaskKey ?? task.stableKey,
        text: task.text,
        sourceRef: `${task.source}#L${task.line}`,
        revision: task.blockHash,
        checkboxState: checkbox === '~' ? 'Partial' : checkbox === ' ' ? 'Open' : 'Checked complete'
      },
      identity: {
        workboardTaskId: task.taskKey,
        stableKey: task.stableKey,
        logicalTaskKey: task.logicalTaskKey,
        sourceRef: task.source,
        sourceFileSha256: sourceHash,
        workboardSnapshotSha256: revision.workboardChecksum
      },
      ...attempts
    };
  } catch {
    return { status: 'UNAVAILABLE' } as const;
  }
}
