#!/usr/bin/env node

/** Execute svelte-check directly and capture only its machine JSONL stdout. */
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const frontend = join(ROOT, 'sveltekit-frontend');
const rawDir = join(ROOT, '.tmp', 'typescript-error-evidence');
mkdirSync(rawDir, { recursive: true });
const rawPath = join(rawDir, `svelte-check-${randomUUID()}.jsonl`);
const args = process.argv.slice(2);
const values = (name) => args.flatMap((value, index) => value === name ? [args[index + 1]] : []).filter(Boolean);
const sourceRefs = [...values('--source-ref')];
const sourceList = values('--source-list')[0];
if (sourceList) {
  const listText = readFileSync(resolve(ROOT, sourceList), 'utf8');
  for (const line of listText.split(/\r?\n/)) {
    const ref = line.trim();
    if (ref && !ref.startsWith('#')) sourceRefs.push(ref);
  }
}
const uniqueSourceRefs = [...new Set(sourceRefs.map((value) => value.replaceAll('\\', '/').replace(/^\.\//, '')))];
if (uniqueSourceRefs.length === 0) {
  console.error(JSON.stringify({ status: 'CAPTURE_BLOCKED', reason: 'BOUNDED_SOURCE_SELECTION_REQUIRED', hint: '--source-ref <frontend-relative-path> or --source-list <file>', writesPerformed: false }));
  process.exit(2);
}
const maxSources = Number(values('--max-sources')[0] ?? 500);
if (!Number.isInteger(maxSources) || maxSources < 1 || uniqueSourceRefs.length > maxSources) {
  console.error(JSON.stringify({ status: 'CAPTURE_BLOCKED', reason: 'SOURCE_BATCH_LIMIT_EXCEEDED', requested: uniqueSourceRefs.length, maxSources, writesPerformed: false }));
  process.exit(2);
}
const tempTsconfig = join(rawDir, `tsconfig-${randomUUID()}.json`);
const streamErrorsInput = values('--stream-errors')[0];
writeFileSync(tempTsconfig, `${JSON.stringify({ extends: join(frontend, 'tsconfig.json').replaceAll('\\', '/'), include: uniqueSourceRefs.map((ref) => join(frontend, ref).replaceAll('\\', '/')) }, null, 2)}\n`, 'utf8');
const checkerEntry = join(frontend, 'node_modules', 'svelte-check', 'bin', 'svelte-check');
if (!existsSync(checkerEntry)) {
  console.error(JSON.stringify({ status: 'CAPTURE_BLOCKED', reason: 'SVELTE_CHECK_NOT_INSTALLED', writesPerformed: false }));
  process.exit(2);
}
// 'machine' (not 'machine-verbose') never emits JSON at all for diagnostic lines -- confirmed
// live against real svelte-check v4 output, not assumed -- it prints a hand-formatted
// `TYPE "file" line:col "message"` string per diagnostic. Only 'machine-verbose' makes
// MachineFriendlyWriter emit a real (timestamp-prefixed) JSON payload per diagnostic, which is
// what typescript-error-evidence-v1.mjs's parser actually requires.
const child = spawn(process.execPath, [checkerEntry, '--tsconfig', tempTsconfig, '--output', 'machine-verbose', '--threshold', 'error'], {
  cwd: frontend,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
const output = createWriteStream(rawPath, { encoding: 'utf8' });
let bytes = 0;
const maxBytes = 128 * 1024 * 1024;
child.stdout.on('data', (chunk) => {
  bytes += chunk.length;
  if (bytes > maxBytes) { child.kill(); return; }
  output.write(chunk);
});
let stderr = '';
child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8').slice(0, 4000); });
const [result] = await once(child, 'close');
output.end();
await once(output, 'close');
if (bytes > maxBytes) {
  unlinkSync(rawPath);
  console.error(JSON.stringify({ status: 'CAPTURE_BLOCKED', reason: 'MACHINE_JSONL_BYTE_LIMIT_EXCEEDED', writesPerformed: false }));
  process.exit(2);
}
const captureArgs = [join(ROOT, 'scripts/atlas/capture-typescript-error-evidence-v1.mjs'), '--input', rawPath];
if (streamErrorsInput) captureArgs.push('--stream-errors', streamErrorsInput);
const capture = spawn(process.execPath, captureArgs, {
  cwd: ROOT, stdio: ['ignore', 'inherit', 'pipe'], windowsHide: true,
});
let captureErr = '';
capture.stderr.on('data', (chunk) => { captureErr += chunk.toString('utf8'); });
const [captureCode] = await once(capture, 'close');
try { unlinkSync(rawPath); } catch { /* best-effort transient cleanup */ }
try { unlinkSync(tempTsconfig); } catch { /* best-effort transient cleanup */ }
if (captureCode !== 0) {
  console.error(JSON.stringify({ status: 'CAPTURE_FAILED', checkerExitCode: result, stderr, captureError: captureErr, writesPerformed: false }));
  process.exit(captureCode || 2);
}
const reportPath = join(ROOT, 'docs', 'reports', 'typescript-error-evidence-v1.json');
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
report.input.path = 'svelte-check direct machine stdout (bounded source selection)';
report.checker = {
  command: 'svelte-check --output machine-verbose --threshold error',
  exitCode: result,
  completed: result === 0 || result === 1,
  status: result === 0 ? 'PASS' : result === 1 ? 'ERRORS_REPORTED' : 'CHECKER_FAILED',
  stderr: stderr || null,
};
report.captureStatus = result === 0 || result === 1 ? 'COMPLETE' : 'INCOMPLETE_CHECKER_FAILURE';
report.writesPerformed = false;
report.safeToApply = false;
const reportTmp = `${reportPath}.tmp-${process.pid}`;
writeFileSync(reportTmp, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
renameSync(reportTmp, reportPath);
console.log(JSON.stringify({ status: report.captureStatus === 'COMPLETE' ? (result === 0 ? 'EVIDENCE_CAPTURED' : 'EVIDENCE_CAPTURED_CHECKER_ERRORS') : 'CAPTURE_INCOMPLETE', checkerExitCode: result, captured: report.summary.captured, writesPerformed: false, safeToApply: false, reportPath }));
