import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanRepoDiskUsage } from './audit-repo-disk-usage-v1.mjs';

test('counts root files and unlimited-depth files without following links', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'atlas-disk-audit-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'atlas-disk-audit-link-'));
  try {
    await writeFile(path.join(root, 'root.bin'), Buffer.alloc(7));
    const deep = path.join(root, 'alpha', 'b', 'c', 'd', 'e', 'f', 'g', 'h');
    await mkdir(deep, { recursive: true });
    await writeFile(path.join(deep, 'payload.bin'), Buffer.alloc(11));
    await writeFile(path.join(outside, 'outside.bin'), Buffer.alloc(101));
    try {
      await symlink(outside, path.join(root, 'external-link'), 'junction');
    } catch (error) {
      if (!['EPERM', 'EACCES', 'UNKNOWN'].includes(error.code)) throw error;
    }

    const result = await scanRepoDiskUsage(root);
    assert.equal(result.fileCount, 2);
    assert.equal(result.logicalBytes, '18');
    assert.equal(result.depthLimit, null);
    assert.equal(result.symlinksFollowed, false);
    assert.equal(result.topLevel.find((item) => item.name === '[root-files]').logicalBytes, '7');
    assert.equal(result.topLevel.find((item) => item.name === 'alpha').logicalBytes, '11');
    assert.equal(result.readErrorCount, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
