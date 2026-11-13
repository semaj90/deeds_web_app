import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const builder = path.join(repoRoot, 'scripts/atlas/build-error-fixing-kanban-tasks-v1.mjs');

test('daily Graphify bridge preserves the explicit OpenSpec ref without replacing the diagnostic ID', () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'atlas-error-fix-kanban-'));
  try {
    const inputPath = path.join(tempRoot, 'plan.json');
    const boardPath = path.join(tempRoot, 'board.json');
    const ref = {
      schema: 'atlas.openspec-workboard-task-ref.v1',
      workboardTaskId: 'change-a:7', stableKey: 'change-a#0123456789abcdef', logicalTaskKey: null,
      taskRevision: `sha256:${'a'.repeat(64)}`, sourceRef: 'openspec/changes/change-a/tasks.md',
      sourceFileSha256: `sha256:${'b'.repeat(64)}`, workboardSnapshotSha256: `sha256:${'c'.repeat(64)}`,
      workboardGeneratedAt: '2026-11-12T08:00:00.000Z', currentHead: 'head-1',
      status: 'CAPTURE_ASSERTED_SOURCE_CURRENT_LINK', dispatchRevalidation: 'REQUIRED',
      authority: 'PROPOSAL_REFERENCE_ONLY', canonicalAuthority: false,
    };
    writeFileSync(inputPath, JSON.stringify({
      schema: 'atlas.agentic-error-fixing.v1', mode: 'READ_ONLY_PROPOSAL', status: 'PLAN_READY',
      mutationAllowed: false, canonicalAuthority: false, writesPerformed: false,
      candidates: [{
        fingerprint: `sha256:${'d'.repeat(16)}`, kind: 'TYPECHECK_OR_SCHEMA', owner: 'checker',
        diagnostic: 'TS2345', proposedAction: 'review the type mismatch', file: 'src/example.ts',
        diagnosticFingerprint: `sha256:${'e'.repeat(64)}`,
        status: 'PROPOSED', mutationAllowed: false, workboardTaskRef: ref,
      }],
    }));
    writeFileSync(boardPath, JSON.stringify({ generated: '2026-11-12T08:00:00.000Z', tasks: [] }));

    const result = spawnSync(process.execPath, [builder, '--input', inputPath, '--board', boardPath, '--write'], {
      cwd: repoRoot, encoding: 'utf8', windowsHide: true,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const board = JSON.parse(readFileSync(boardPath, 'utf8'));
    const [task] = board.tasks;
    assert.equal(task.id, `err-fix:sha256:${'d'.repeat(16)}`);
    assert.equal(task.diagnostic_fingerprint, `sha256:${'e'.repeat(64)}`);
    assert.deepEqual(task.openspec_task_ref, ref);
    assert.equal(task.mutationAllowed, false);
    assert.equal(task.canonicalAuthority, false);
    assert.equal(task.dispatchable, false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
