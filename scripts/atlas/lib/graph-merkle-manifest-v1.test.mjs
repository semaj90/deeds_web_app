import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buildMerkleManifest, inclusionProof, verifyInclusionProof, emptyRoot, publicManifest, MerkleManifestError } from './graph-merkle-manifest-v1.mjs';

const d = (s) => `sha256:${crypto.createHash('sha256').update(s).digest('hex')}`;
const parts = (n) => Array.from({ length: n }, (_, i) => ({ partitionId: `nodes-${String(i).padStart(4, '0')}`, bytesSha256: d(`bytes-${i}`) }));
const code = (fn) => { try { fn(); } catch (e) { return e instanceof MerkleManifestError ? e.code : `OTHER:${e.message}`; } return null; };

test('empty tree has a fixed, domain-tagged root distinct from any single leaf', () => {
  const m = buildMerkleManifest([]);
  assert.equal(m.rootSha256, `sha256:${emptyRoot().toString('hex')}`);
  assert.notEqual(m.rootSha256, buildMerkleManifest(parts(1)).rootSha256);
  assert.equal(m.leafCount, 0);
});

test('root is independent of input order and changes with any partition byte digest or id', () => {
  const p = parts(5);
  const a = buildMerkleManifest(p).rootSha256;
  assert.equal(buildMerkleManifest([...p].reverse()).rootSha256, a);
  assert.notEqual(buildMerkleManifest(p.map((x, i) => (i === 2 ? { ...x, bytesSha256: d('tampered') } : x))).rootSha256, a);
  assert.notEqual(buildMerkleManifest(p.map((x, i) => (i === 2 ? { ...x, partitionId: 'other' } : x))).rootSha256, a);
});

test('every leaf of trees with odd and even sizes has a valid inclusion proof', () => {
  for (const n of [1, 2, 3, 4, 5, 7, 8, 9, 16, 17]) {
    const m = buildMerkleManifest(parts(n));
    for (const p of m.partitions) assert.equal(verifyInclusionProof(inclusionProof(m, p.partitionId), m.rootSha256), true, `n=${n} ${p.partitionId}`);
  }
});

test('tampered proofs fail: wrong bytes, wrong id, altered or reordered path, wrong root', () => {
  const m = buildMerkleManifest(parts(6)); const proof = inclusionProof(m, 'nodes-0003');
  assert.equal(verifyInclusionProof({ ...proof, bytesSha256: d('x') }, m.rootSha256), false);
  assert.equal(verifyInclusionProof({ ...proof, partitionId: 'nodes-0004' }, m.rootSha256), false);
  assert.equal(verifyInclusionProof({ ...proof, path: [{ ...proof.path[0], hash: d('x').slice(7) }, ...proof.path.slice(1)] }, m.rootSha256), false);
  assert.equal(verifyInclusionProof({ ...proof, path: [...proof.path].reverse() }, m.rootSha256), proof.path.length < 2);
  assert.equal(verifyInclusionProof(proof, buildMerkleManifest(parts(7)).rootSha256), false);
  assert.equal(verifyInclusionProof({ ...proof, path: [{ side: 'up', hash: 'zz' }] }, m.rootSha256), false);
});

test('a leaf cannot be passed off as an internal node (domain separation)', () => {
  const m = buildMerkleManifest(parts(2));
  const forged = { partitionId: 'forged', bytesSha256: m.rootSha256, path: [] };
  assert.equal(verifyInclusionProof(forged, m.rootSha256), false);
});

test('invalid and duplicate partitions are rejected, never skipped', () => {
  assert.equal(code(() => buildMerkleManifest([{ partitionId: '', bytesSha256: d('a') }])), 'PARTITION_ID_INVALID');
  assert.equal(code(() => buildMerkleManifest([{ partitionId: 'a', bytesSha256: 'nope' }])), 'PARTITION_DIGEST_INVALID');
  assert.equal(code(() => buildMerkleManifest([{ partitionId: 'a', bytesSha256: d('1') }, { partitionId: 'a', bytesSha256: d('2') }])), 'PARTITION_ID_DUPLICATE');
  assert.equal(code(() => inclusionProof(buildMerkleManifest(parts(2)), 'missing')), 'PARTITION_NOT_IN_MANIFEST');
});

test('manifest carries no authority and the public form hides internals', () => {
  const m = publicManifest(buildMerkleManifest(parts(3)));
  assert.equal(m.sourceAuthority, false);
  assert.equal(m.canonicalAuthority, false);
  assert.equal('_levels' in m, false);
});
