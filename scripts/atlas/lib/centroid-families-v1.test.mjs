import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCentroidDescriptorV1, buildCentroidKeyV1, parseCentroidKeyV1 } from './centroid-cache-key-contract-v1.mjs';

const D = (c) => `sha256:${c.repeat(64)}`;
const FS = D('a');
const MODEL = D('c');

const CASES = [
  { family: 'som', cell: { row: 7, col: 12 }, cellId: 'r07c12' },
  { family: 'kmeans', cell: { index: 3 }, cellId: 'k003' },
  { family: 'domain', cell: { domainId: 'auth' }, cellId: 'auth' },
];

for (const c of CASES) {
  test(`${c.family}: exact key round trip and descriptor binding`, () => {
    const key = buildCentroidKeyV1({ family: c.family, featureSnapshotDigest: FS, modelDigest: MODEL, cell: c.cell });
    const parsed = parseCentroidKeyV1(key);
    assert.equal(parsed.family, c.family);
    assert.equal(parsed.cellId, c.cellId);
    const d = buildCentroidDescriptorV1({ family: c.family, featureSnapshotDigest: FS, modelDigest: MODEL, cell: c.cell, values: [0.6, 0.8], memberCount: 2, createdAt: 't', expiresAt: 't2' });
    assert.equal(d.key, key);
    assert.equal(d.status, 'PROPOSAL_ONLY');
  });
}

test('domain centroid carries the taxonomy revision in the model slot and needs an explicit domain id', () => {
  const key = buildCentroidKeyV1({ family: 'domain', featureSnapshotDigest: FS, modelDigest: D('e'), cell: { domainId: 'ui' } });
  assert.match(key, /^atlas:centroid:v1:domain:fs[0-9a-f]{12}:m[0-9a-f]{12}:ui$/);
  assert.throws(() => buildCentroidKeyV1({ family: 'domain', featureSnapshotDigest: FS, modelDigest: D('e'), cell: {} }), /CENTROID_CELL_INVALID/);
});

test('feature is not a v1 family: refused until its producer semantics are decided', () => {
  assert.throws(() => buildCentroidKeyV1({ family: 'feature', featureSnapshotDigest: FS, modelDigest: MODEL, cell: { domainId: 'x' } }), /CENTROID_FAMILY_UNSUPPORTED/);
});

test('the same cell in different families never shares a key', () => {
  const som = buildCentroidKeyV1({ family: 'som', featureSnapshotDigest: FS, modelDigest: MODEL, cell: { row: 3, col: 3 } });
  const km = buildCentroidKeyV1({ family: 'kmeans', featureSnapshotDigest: FS, modelDigest: MODEL, cell: { index: 3 } });
  assert.notEqual(som, km);
  assert.ok(som.includes(':som:') && km.includes(':kmeans:'));
});
