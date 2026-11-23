import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  applyConflictFreeBatchPatchV1,
  sha256Text,
} from './apply-conflict-free-batch-patch-v1.mjs';

test('dry-run validates checksum locks without mutating files', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-batch-patch-'));
  try {
    const fileA = path.join(tmp, 'tasks.md');
    const orig = '- [ ] **TASK-1** Do thing\n';
    fs.writeFileSync(fileA, orig, 'utf8');

    const res = applyConflictFreeBatchPatchV1({
      repoRoot: tmp,
      apply: false,
      patches: [
        {
          sourceRef: 'tasks.md',
          expectedFileSha256: sha256Text(orig),
          taskRevision: 'rev-1',
          targetText: '- [ ] **TASK-1**',
          replacementText: '- [x] **TASK-1**',
        },
      ],
    });
    assert.equal(res.status, 'DRY_RUN_VALIDATED');
    assert.equal(res.applied, false);
    assert.equal(fs.readFileSync(fileA, 'utf8'), orig);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('rejects stale expectedFileSha256 and duplicate sourceRef', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-batch-patch-'));
  try {
    const fileA = path.join(tmp, 'tasks.md');
    const orig = '- [ ] **TASK-1** Do thing\n';
    fs.writeFileSync(fileA, orig, 'utf8');

    const stale = applyConflictFreeBatchPatchV1({
      repoRoot: tmp,
      apply: true,
      patches: [
        {
          sourceRef: 'tasks.md',
          expectedFileSha256: `sha256:${'0'.repeat(64)}`,
          taskRevision: 'rev-1',
          targetText: '- [ ] **TASK-1**',
          replacementText: '- [x] **TASK-1**',
        },
      ],
    });
    assert.equal(stale.status, 'CONFLICT_REJECTED');
    assert.match(stale.failure, /^FILE_SHA256_MISMATCH/);

    const dup = applyConflictFreeBatchPatchV1({
      repoRoot: tmp,
      apply: true,
      patches: [
        {
          sourceRef: 'tasks.md',
          expectedFileSha256: sha256Text(orig),
          taskRevision: 'rev-1',
          targetText: '- [ ]',
          replacementText: '- [x]',
        },
        {
          sourceRef: 'tasks.md',
          expectedFileSha256: sha256Text(orig),
          taskRevision: 'rev-2',
          targetText: 'TASK-1',
          replacementText: 'TASK-2',
        },
      ],
    });
    assert.equal(dup.status, 'CONFLICT_REJECTED');
    assert.match(dup.failure, /^DUPLICATE_SOURCE_REF_IN_BATCH/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('atomically rolls back all files when post-batch validator fails', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-batch-patch-'));
  try {
    const fileA = path.join(tmp, 'a.md');
    const fileB = path.join(tmp, 'b.json');
    const origA = '- [ ] **A**\n';
    const origB = '{"done":false}\n';
    fs.writeFileSync(fileA, origA, 'utf8');
    fs.writeFileSync(fileB, origB, 'utf8');

    const rolled = applyConflictFreeBatchPatchV1({
      repoRoot: tmp,
      apply: true,
      patches: [
        {
          sourceRef: 'a.md',
          expectedFileSha256: sha256Text(origA),
          taskRevision: 'rev-a',
          targetText: '- [ ] **A**',
          replacementText: '- [x] **A**',
        },
        {
          sourceRef: 'b.json',
          expectedFileSha256: sha256Text(origB),
          taskRevision: 'rev-b',
          targetText: '"done":false',
          replacementText: '"done":true',
        },
      ],
      validator: () => ({ ok: false, failure: 'OPENSPEC_STRICT_FAILED' }),
    });

    assert.equal(rolled.status, 'ROLLED_BACK');
    assert.equal(rolled.rolledBack, true);
    assert.equal(rolled.failure, 'OPENSPEC_STRICT_FAILED');
    assert.equal(fs.readFileSync(fileA, 'utf8'), origA);
    assert.equal(fs.readFileSync(fileB, 'utf8'), origB);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
