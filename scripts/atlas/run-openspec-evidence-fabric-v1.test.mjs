import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildSnapshot } from './openspec-dirty-set-v1.mjs';
import { parseRunnerArgs, phaseFromStdout } from './run-openspec-evidence-fabric-v1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RUNNER = path.join(ROOT, 'scripts', 'atlas', 'run-openspec-evidence-fabric-v1.mjs');

const card = (number) => ({
  taskIdentity: { taskRef: `change/tasks.md#L${number}`, canonicalTaskRef: `task:${number}`, changeId: 'change' },
  claim: `claim ${number}`,
  predicates: [{ status: 'CLAIM_ONLY', text: `claim ${number}` }],
  proofState: 'UNPROVEN',
  receiptRefs: [],
  blockers: [],
  contextBlob: `claim ${number}; REVISION workspace=sha256:fixture source=sha256:fixture`,
  checksum: `card-${number}`,
});

test('importing the runner does not start the pipeline (entry-point guard)', () => {
  assert.equal(typeof phaseFromStdout, 'function');
});

test('phase counters are merged only from a structured phaseReceipt and only whitelisted fields', () => {
  const out = JSON.stringify({ x: 1, phaseReceipt: { inputRevision: 'r', outputRevision: 'o', inputCount: 10, dirtyCount: 2, skippedUnchangedCount: 8, writesPerformed: false, secret: 'nope' } });
  assert.deepEqual(phaseFromStdout(out), { phase: { inputRevision: 'r', outputRevision: 'o', inputCount: 10, dirtyCount: 2, skippedUnchangedCount: 8, writesPerformed: false } });
});

test('stages that print nothing structured are unchanged', () => {
  assert.deepEqual(phaseFromStdout('plain text'), {});
  assert.deepEqual(phaseFromStdout(JSON.stringify({ schema: 'x' })), {});
  assert.deepEqual(phaseFromStdout(JSON.stringify({ phaseReceipt: 5 })), {});
});

test('the dirty-set stage is registered once, read-only, after card compilation and before packets', () => {
  const src = readFileSync(new URL('./run-openspec-evidence-fabric-v1.mjs', import.meta.url), 'utf8');
  const order = [...src.matchAll(/\['(EVF-05[A-Z_]*)',/g)].map((m) => m[1]);
  assert.deepEqual(order, ['EVF-05_CARD_COMPILATION', 'EVF-05B_DIRTY_SET', 'EVF-05_FEATURE_PACKET_COMPILATION']);
  assert.equal((src.match(/\['EVF-05B_DIRTY_SET',/g) ?? []).length, 1);
  assert.ok(src.includes('OPENSPEC_DIRTY_SET_OUTPUT'));
  assert.ok(!/--write-snapshot/.test(src.replace(/\/\/[^\n]*/g, '')), 'the runner must never write the baseline');
});

test('the worker cap is unchanged: default 2, hard cap 3', () => {
  const src = readFileSync(new URL('./run-openspec-evidence-fabric-v1.mjs', import.meta.url), 'utf8');
  assert.ok(src.includes('Math.min(2, Math.max(1, available - 1))'));
  assert.ok(src.includes('Math.min(3, configured)'));
});

test('incremental dry-run mode is explicit and defaults remain the full runner', () => {
  assert.deepEqual(parseRunnerArgs([]), { mode: 'FULL' });
  assert.deepEqual(parseRunnerArgs(['--incremental', '--dry-run']), {
    mode: 'INCREMENTAL_DRY_RUN', cards: null, baseline: null,
  });
  assert.throws(() => parseRunnerArgs(['--incremental']), /USAGE:/);
  assert.throws(() => parseRunnerArgs(['--incremental', '--dry-run', '--write-snapshot']), /UNSUPPORTED_INCREMENTAL_DRY_RUN_ARGUMENT/);
});

test('incremental dry-run emits dirty receipt to stdout without changing baseline or writing reports', () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'openspec-incremental-dry-run-'));
  assert.equal(path.dirname(tempRoot), os.tmpdir());
  const cardsPath = path.join(tempRoot, 'cards.json');
  const baselinePath = path.join(tempRoot, 'baseline.json');
  const reportPath = path.join(tempRoot, 'pipeline-report.json');
  const dirtyReceiptPath = path.join(tempRoot, 'dirty-set-report.json');
  const firstCard = card(1);
  const baselineText = `${JSON.stringify(buildSnapshot([firstCard]))}\n`;
  writeFileSync(cardsPath, JSON.stringify({
    schema: 'fixture.cards.v1',
    source: { workspaceRevision: 'sha256:workspace-revision' },
    cards: [firstCard, card(2)],
  }));
  writeFileSync(baselinePath, baselineText);

  try {
    const stdout = execFileSync(process.execPath, [
      RUNNER,
      '--incremental', '--dry-run',
      '--cards', cardsPath,
      '--baseline', baselinePath,
    ], {
      cwd: ROOT,
      encoding: 'utf8',
      windowsHide: true,
      env: {
        ...process.env,
        OPENSPEC_EVIDENCE_PIPELINE_OUTPUT: reportPath,
        OPENSPEC_DIRTY_SET_OUTPUT: dirtyReceiptPath,
      },
    });
    const result = JSON.parse(stdout);
    assert.equal(result.schema, 'atlas.openspec-incremental-dry-run.v1');
    assert.equal(result.status, 'DRY_RUN_COMPLETED');
    assert.equal(result.writesPerformed, false);
    assert.deepEqual(result.writes, { reports: 0, baseline: 0, postgres: 0, qdrant: 0, valkey: 0, tasksMd: 0 });
    assert.equal(result.phaseReceipt.phase, 'EVF-05B_DIRTY_SET');
    assert.equal(result.phaseReceipt.inputRevision, 'sha256:workspace-revision');
    assert.match(result.phaseReceipt.outputRevision, /^sha256:[a-f0-9]{64}$/);
    assert.equal(result.phaseReceipt.dirtyCount, 1);
    assert.equal(result.phaseReceipt.skippedUnchangedCount, 1);
    assert.equal(result.dirtySetReceipt.writesPerformed, false);
    assert.equal(readFileSync(baselinePath, 'utf8'), baselineText);
    assert.equal(existsSync(reportPath), false);
    assert.equal(existsSync(dirtyReceiptPath), false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
