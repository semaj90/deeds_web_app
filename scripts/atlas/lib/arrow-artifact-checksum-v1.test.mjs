import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { verifyArtifactChecksum } from './arrow-artifact-checksum-v1.mjs';

const dir = mkdtempSync(path.join(tmpdir(), 'arrow-checksum-'));
const payload = Buffer.from('ARROW1 fixture bytes, not a real Arrow file');
const good = path.join(dir, 'good.arrow');
const corrupt = path.join(dir, 'corrupt.arrow');
writeFileSync(good, payload);
writeFileSync(corrupt, Buffer.concat([payload, Buffer.from('X')]));
const expected = createHash('sha256').update(payload).digest('hex');

test.after(() => rmSync(dir, { recursive: true, force: true }));

test('accepts an artifact whose bytes match the descriptor checksum', async () => {
  const r = await verifyArtifactChecksum(good, expected);
  assert.equal(r.ok, true);
  assert.equal(r.sha256, expected);
  assert.equal(r.bytes, payload.length);
});

test('refuses a corrupted artifact with CHECKSUM_MISMATCH and no partial result', async () => {
  const r = await verifyArtifactChecksum(corrupt, expected);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'CHECKSUM_MISMATCH');
  assert.equal(r.bytes, undefined);
});

test('refuses a malformed descriptor checksum before reading the file', async () => {
  const r = await verifyArtifactChecksum(good, 'not-a-sha');
  assert.deepEqual(r, { ok: false, reason: 'DESCRIPTOR_SHA256_INVALID' });
});

test('refuses a missing artifact with a reason, not an exception', async () => {
  const r = await verifyArtifactChecksum(path.join(dir, 'missing.arrow'), expected);
  assert.equal(r.ok, false);
  assert.match(r.reason, /^ARTIFACT_UNREADABLE:/);
});

test('rejects an uppercase checksum (descriptors use lowercase hex)', async () => {
  const r = await verifyArtifactChecksum(good, expected.toUpperCase());
  assert.equal(r.reason, 'DESCRIPTOR_SHA256_INVALID');
});
