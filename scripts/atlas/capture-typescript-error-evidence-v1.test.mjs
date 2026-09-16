import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildEvidenceReport } from './typescript-error-evidence-v1.mjs';

// Fixture lines below match REAL `svelte-check --output machine-verbose` output byte-for-byte
// in shape (verified live against svelte-check v4 in this repo before writing this fix):
// `<epochMs> <jsonPayload>` per diagnostic line, plus bare `START`/`COMPLETED` protocol lines
// with no JSON payload at all. Earlier fixtures here used a bare-JSON-per-line shape that never
// occurs in real output -- that mismatch is exactly why the capture pipeline silently captured
// zero real errors from a real checker run despite passing these tests.
function machineVerboseLine(payload) {
  return `${Date.now()} ${JSON.stringify(payload)}`;
}

test('machine-verbose capture fingerprints diagnostics and remains non-promotional', () => {
  const directory = mkdtempSync(join(tmpdir(), 'atlas-ts-evidence-'));
  try {
    const input = join(directory, 'check.jsonl');
    const output = join(directory, 'report.json');
    writeFileSync(input, [
      `${Date.now()} START "c:\\\\workspace"`,
      machineVerboseLine({ type: 'ERROR', filename: 'src/example.ts', start: { line: 3, character: 1 }, end: { line: 3, character: 5 }, message: 'Type mismatch', code: 2322 }),
      'not-json',
      machineVerboseLine({ type: 'WARNING', filename: 'src/example.ts', start: { line: 6, character: 0 }, end: { line: 6, character: 3 }, message: 'Implicit any', code: 7006 }),
      `${Date.now()} COMPLETED 1 FILES 1 ERRORS 1 WARNINGS 1 FILES_WITH_PROBLEMS`,
    ].join('\n'));
    const result = spawnSync(process.execPath, ['scripts/atlas/capture-typescript-error-evidence-v1.mjs', '--input', input, '--output', output, '--batch-lines', '2'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(readFileSync(output, 'utf8'));
    assert.equal(report.summary.captured, 2);
    assert.equal(report.summary.malformedLineCount, 1);
    assert.equal(report.summary.protocolLineCount, 2);
    assert.equal(report.errors[0].sourceRef, 'src/example.ts');
    // 0-indexed start.line/character in real output become 1-indexed line/column here.
    assert.equal(report.errors[0].line, 4);
    assert.equal(report.errors[0].column, 2);
    assert.equal(report.errors[0].code, 'TS2322');
    assert.equal(report.errors[0].severity, 'error');
    assert.equal(report.errors[1].severity, 'warning');
    assert.match(report.errors[0].errorId, /^tserr:[0-9a-f]{64}$/);
    assert.equal(report.promotion.taskCandidateEligible, false);
    assert.equal(report.writesPerformed, false);
    assert.equal(report.safeToApply, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('normalizer excludes generated/runtime observations and preserves nullable lineage', () => {
  const input = [
    machineVerboseLine({ type: 'ERROR', filename: 'src/a.ts', start: { line: 0, character: 0 }, message: 'x', code: 1 }),
    machineVerboseLine({ type: 'ERROR', filename: 'node_modules/pkg/index.ts', start: { line: 1, character: 0 }, message: 'noise', code: 2 }),
    machineVerboseLine({ type: 'ERROR', filename: 'qdrant-windows/storage.ts', start: { line: 2, character: 0 }, message: 'noise', code: 3 }),
    machineVerboseLine({ type: 'ERROR', filename: 'src/a.ts', start: { line: 0, character: 0 }, message: 'x', code: 1 }),
  ].join('\n');
  const report = buildEvidenceReport(input);
  assert.equal(report.summary.captured, 2);
  assert.equal(report.summary.excludedLineCount, 2);
  assert.equal(report.errors[0].errorId, report.errors[1].errorId);
  assert.equal(report.errors[0].workspaceRevision, null);
  assert.equal(report.errors[0].sourceRevision, null);
  assert.equal(report.promotion.taskCandidateEligible, false);
});

test('stream mode keeps large captures out of the report heap', () => {
  const directory = mkdtempSync(join(tmpdir(), 'atlas-ts-evidence-stream-'));
  try {
    const input = join(directory, 'check.jsonl');
    const output = join(directory, 'report.json');
    const streamed = join(directory, 'errors.jsonl');
    writeFileSync(input, Array.from({ length: 7 }, (_, index) => machineVerboseLine({
      type: 'ERROR', filename: `src/error-${index}.ts`, start: { line: 0, character: 0 }, message: 'x', code: 2322,
    })).join('\n'));
    const result = spawnSync(process.execPath, ['scripts/atlas/capture-typescript-error-evidence-v1.mjs', '--input', input,
      '--output', output, '--stream-errors', streamed, '--batch-lines', '2'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(readFileSync(output, 'utf8'));
    assert.equal(report.summary.captured, 7);
    assert.deepEqual(report.errors, []);
    assert.equal(report.streamedErrors, true);
    assert.equal(readFileSync(streamed, 'utf8').trim().split('\n').length, 7);
    assert.equal(report.summary.byCode.TS2322, 7);
    assert.equal(report.writesPerformed, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
