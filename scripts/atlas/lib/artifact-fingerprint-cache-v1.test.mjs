import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyArtifactFingerprintCacheV1,
  getReusableArtifactFingerprintV1,
  parseArtifactFingerprintCacheV1,
  serializeArtifactFingerprintCacheV1,
  setArtifactFingerprintV1,
} from './artifact-fingerprint-cache-v1.mjs';

const entry = {
  relPath: 'docs/a.json', dev: '1', ino: '99', sizeBytes: 10,
  mtimeNs: '100', ctimeNs: '200',
};
const fingerprint = 'a'.repeat(64);

test('reuses a fingerprint only for an identical file identity and change tuple', () => {
  const cache = emptyArtifactFingerprintCacheV1();
  setArtifactFingerprintV1(cache, entry, fingerprint);
  assert.equal(getReusableArtifactFingerprintV1(cache, entry), fingerprint);
  assert.equal(getReusableArtifactFingerprintV1(cache, { ...entry, ino: '100' }), null);
  assert.equal(getReusableArtifactFingerprintV1(cache, { ...entry, sizeBytes: 11 }), null);
  assert.equal(getReusableArtifactFingerprintV1(cache, { ...entry, mtimeNs: '101' }), null);
  assert.equal(getReusableArtifactFingerprintV1(cache, { ...entry, ctimeNs: '201' }), null);
});

test('serializes deterministically and round-trips the cache contract', () => {
  const cache = emptyArtifactFingerprintCacheV1();
  setArtifactFingerprintV1(cache, { ...entry, relPath: 'z.json' }, fingerprint);
  setArtifactFingerprintV1(cache, { ...entry, relPath: 'a.json' }, fingerprint);
  const encoded = serializeArtifactFingerprintCacheV1(cache);
  assert.equal(encoded, serializeArtifactFingerprintCacheV1(cache));
  assert.deepEqual(parseArtifactFingerprintCacheV1(JSON.parse(encoded)), cache);
});

test('rejects malformed cache documents and digests', () => {
  assert.throws(() => parseArtifactFingerprintCacheV1({ schema: 'other', entries: {} }), /CACHE_INVALID/);
  assert.throws(() => setArtifactFingerprintV1(emptyArtifactFingerprintCacheV1(), entry, 'bad'), /FINGERPRINT_INVALID/);
});
