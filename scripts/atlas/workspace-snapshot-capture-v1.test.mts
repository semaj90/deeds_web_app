import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { observeSnapshot, sealSnapshot, validateSnapshot } from './lib/workspace-snapshot-capture-v1.mjs';

test('dirty nested bytes alter snapshot identity; replay stays stable; drift blocks capture', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'atlas-snapshot-proof-'));
  function init(directory: string) {
    mkdirSync(directory, { recursive: true });
    const git = (...args: string[]) => execFileSync('git', args, { cwd: directory, stdio: 'pipe' });
    git('init'); writeFileSync(path.join(directory, 'source.ts'), 'export const value = 1;\n');
    git('add', 'source.ts');
    git('-c', 'user.name=Snapshot Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture');
  }
  init(root); const child = path.join(root, 'nested'); init(child);
  const first = observeSnapshot(root, 'fixture-workspace');
  assert.equal(first.repositories.length, 2);
  assert.equal(first.sources.length, 2);
  assert.deepEqual([...first.sources.map((source) => source.repositoryId)].sort(), ['repo:nested', 'repo:root']);
  assert.equal(new Set(first.sources.map((source) => source.sourceIdentityKey)).size, 2);
  const replay = sealSnapshot(first, observeSnapshot(root, 'fixture-workspace'));
  assert.equal(replay.violations.length, 0);
  assert.equal(validateSnapshot(replay).status, 'SNAPSHOT_BYTES_READBACK_PROVEN');
  writeFileSync(path.join(child, 'source.ts'), 'export const value = 2;\n');
  const changed = observeSnapshot(root, 'fixture-workspace');
  assert.equal(validateSnapshot(replay).status, 'SNAPSHOT_READBACK_BLOCKED');
  assert.equal(changed.repositories[1].head, first.repositories[1].head);
  assert.equal(changed.repositories[1].dirty, true);
  assert.ok(sealSnapshot(first, changed).violations.includes('WORKSPACE_CHANGED_BETWEEN_SCANS'));
  const sealed = sealSnapshot(changed, observeSnapshot(root, 'fixture-workspace'));
  assert.notEqual(sealed.snapshotRevision, replay.snapshotRevision);
  assert.equal(sealed.workspaceRevision, null);
  assert.equal(sealed.canonicalAuthority, false);
  assert.equal(sealed.status, 'CAPTURE_VERIFIED_REQUIRES_PROCESSING_READBACK');
  assert.equal(validateSnapshot(sealed).status, 'SNAPSHOT_BYTES_READBACK_PROVEN');
  assert.ok(validateSnapshot({ ...sealed, snapshotRevision: 'sha256:tampered' }).violations.includes('MANIFEST_CHECKSUM_MISMATCH'));
});
