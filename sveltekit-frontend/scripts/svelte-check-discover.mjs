import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(frontendRoot, '..');
const managedRuns = path.join(repoRoot, '.tmp', 'atlas', 'svelte-check-runs');
const candidatePattern = /(?:svelte[-_]?check|svelte[-_]errors|\.codex-svelte)/i;

export function isCompleteCapture(summary, bytes) {
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  return Boolean(
    summary?.schema === 'atlas.svelte-check-capture.v1' &&
    summary.outputs?.logSha256 === digest &&
    typeof summary.runId === 'string' &&
    typeof summary.gitRevision === 'string' &&
    summary.timedOut === false &&
    summary.interrupted === false &&
    Number.isInteger(summary.exitCode),
  );
}

function discoverLogPaths() {
  const paths = new Set();
  try {
    const listed = execFileSync('rg', [
      '--files', '--hidden', '-g', '*.txt',
      '-g', '!**/node_modules/**', '-g', '!**/.git/**', '-g', '!**/archive/**',
      '-g', '!**/dist/**', '-g', '!**/build/**', '-g', '!**/.tmp/**',
    ], { cwd: repoRoot, encoding: 'utf8', windowsHide: true });
    for (const item of listed.split(/\r?\n/).filter(Boolean)) {
      if (candidatePattern.test(path.basename(item))) paths.add(path.resolve(repoRoot, item));
    }
  } catch (error) {
    if (error.status !== 1) throw error;
  }
  try {
    for (const item of readdirSync(managedRuns, { withFileTypes: true })) {
      if (item.isFile() && item.name.endsWith('.txt')) paths.add(path.join(managedRuns, item.name));
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return [...paths];
}

function inspectLog(logPath) {
  const bytes = readFileSync(logPath);
  const sha256 = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const summaryPath = logPath.replace(/\.txt$/i, '.summary.json');
  let summary = null;
  try {
    summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
  } catch {}
  const complete = isCompleteCapture(summary, bytes);
  const file = statSync(logPath);
  return {
    path: path.relative(repoRoot, logPath).replace(/\\/g, '/'),
    bytes: file.size,
    modifiedAt: file.mtime.toISOString(),
    sha256,
    summaryPath: summary ? path.relative(repoRoot, summaryPath).replace(/\\/g, '/') : null,
    runId: complete ? summary.runId : null,
    gitRevision: complete ? summary.gitRevision : null,
    checkerExitCode: complete ? summary.exitCode : null,
    status: complete ? 'COMPLETE_RECEIPT_MATCHED' : 'INCOMPLETE_OR_UNMATCHED',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const logs = discoverLogPaths().map(inspectLog).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  const latestComplete = logs.find((log) => log.status === 'COMPLETE_RECEIPT_MATCHED') ?? null;
  process.stdout.write(`${JSON.stringify({
    schema: 'atlas.svelte-check-log-discovery.v1',
    readOnly: true,
    logCount: logs.length,
    latestComplete,
    newestObserved: logs[0] ?? null,
    replayCommand: latestComplete ? `npm run check:replay -- "${latestComplete.path}"` : null,
    logs,
  }, null, 2)}\n`);
}
