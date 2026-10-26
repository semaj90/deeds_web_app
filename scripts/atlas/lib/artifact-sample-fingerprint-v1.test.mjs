import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, open, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileSampleFingerprintV1 } from './artifact-sample-fingerprint-v1.mjs';

async function fixtureFile(t, content) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'atlas-artifact-fingerprint-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const filePath = path.join(dir, 'sample.bin');
  await writeFile(filePath, content);
  const metadata = await stat(filePath, { bigint: true });
  return {
    filePath,
    entry: {
      sizeBytes: Number(metadata.size), dev: metadata.dev.toString(), ino: metadata.ino.toString(),
      mtimeNs: metadata.mtimeNs.toString(), ctimeNs: metadata.ctimeNs.toString(),
    },
  };
}

test('samples real files and verifies the file identity/change tuple', async (t) => {
  const content = Buffer.alloc(16_384, 0x5a);
  const { filePath, entry } = await fixtureFile(t, content);
  const sample = await fileSampleFingerprintV1(filePath, entry);
  assert.equal(sample.complete, true);
  assert.equal(sample.bytesRead, 8192);
  assert.match(sample.fingerprint, /^[a-f0-9]{64}$/);
});

test('refuses to sample a file whose content changed after inventory stat', async (t) => {
  const { filePath, entry } = await fixtureFile(t, Buffer.from('before'));
  const handle = await open(filePath, 'r+');
  await handle.write(Buffer.from('after!'), 0, 6, 0);
  await handle.close();
  await assert.rejects(fileSampleFingerprintV1(filePath, entry), /SAMPLE_FILE_METADATA_CHANGED/);
});
