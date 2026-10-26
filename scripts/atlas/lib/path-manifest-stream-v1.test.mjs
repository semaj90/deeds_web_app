import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { openPathManifestStream, verifyPathManifestArtifact } from './path-manifest-stream-v1.mjs';

const sha256 = value => createHash('sha256').update(value).digest('hex');

test('verifies raw path manifests using the legacy contract', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'atlas-path-manifest-'));
  try {
    const file = path.join(root, 'paths.jsonl');
    const content = Buffer.from('{"relativePath":"src/a.ts"}\n');
    writeFileSync(file, content);
    const workspace = { pathManifestSha256: sha256(content) };
    const verified = await verifyPathManifestArtifact(file, workspace);
    assert.equal(verified.compression, 'none');
    assert.equal(verified.contentBytes, content.length);
    let output = '';
    for await (const chunk of openPathManifestStream(file, workspace)) output += chunk.toString('utf8');
    assert.equal(output, content.toString('utf8'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('verifies gzip storage and uncompressed logical digests independently', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'atlas-path-manifest-'));
  try {
    const file = path.join(root, 'paths.jsonl.gz');
    const content = Buffer.from('{"relativePath":"src/a.ts"}\n{"relativePath":"src/b.ts"}\n');
    const stored = gzipSync(content, { mtime: 0 });
    writeFileSync(file, stored);
    const workspace = {
      pathManifestSha256: sha256(content),
      pathManifestStorage: {
        compression: 'gzip', storedBytes: stored.length,
        storedSha256: sha256(stored), uncompressedBytes: content.length,
      },
    };
    const verified = await verifyPathManifestArtifact(file, workspace);
    assert.equal(verified.compression, 'gzip');
    assert.equal(verified.storedBytes, stored.length);
    let output = '';
    for await (const chunk of openPathManifestStream(file, workspace)) output += chunk.toString('utf8');
    assert.equal(output, content.toString('utf8'));
    assert.equal(readFileSync(file).length, stored.length);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects a gzip artifact whose stored-byte digest differs', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'atlas-path-manifest-'));
  try {
    const file = path.join(root, 'paths.jsonl.gz');
    const content = Buffer.from('{"relativePath":"src/a.ts"}\n');
    const stored = gzipSync(content, { mtime: 0 });
    writeFileSync(file, stored);
    await assert.rejects(verifyPathManifestArtifact(file, {
      pathManifestSha256: sha256(content),
      pathManifestStorage: {
        compression: 'gzip', storedBytes: stored.length,
        storedSha256: '0'.repeat(64), uncompressedBytes: content.length,
      },
    }), /PATH_MANIFEST_STORAGE_CHECKSUM_INVALID/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects decompressed content that differs from the logical digest', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'atlas-path-manifest-'));
  try {
    const file = path.join(root, 'paths.jsonl.gz');
    const content = Buffer.from('{"relativePath":"src/a.ts"}\n');
    const stored = gzipSync(content, { mtime: 0 });
    writeFileSync(file, stored);
    await assert.rejects(verifyPathManifestArtifact(file, {
      pathManifestSha256: '0'.repeat(64),
      pathManifestStorage: {
        compression: 'gzip', storedBytes: stored.length,
        storedSha256: sha256(stored), uncompressedBytes: content.length,
      },
    }), /PATH_MANIFEST_CHECKSUM_INVALID/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
