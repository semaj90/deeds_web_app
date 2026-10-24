import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertPublishableCentroidV1,
  assertSafeToPublishCentroidsV1,
  buildCentroidDescriptorV1,
  buildCentroidKeyV1,
  centroidDigestV1,
  decodeF32LEV1,
  decodePostgresLatent64V1,
  parseCentroidKeyV1,
  resolveCentroidLookupKeysV1,
} from './centroid-cache-key-contract-v1.mjs';

const D = (c) => `sha256:${c.repeat(64)}`;
const FS = D('a');
const FS2 = D('b');
const M = D('c');
const M2 = D('d');

test('canonical key has the v1 namespace and round-trips through the parser', () => {
  const key = buildCentroidKeyV1({ family: 'som', featureSnapshotDigest: FS, modelDigest: M, cell: { row: 7, col: 12 } });
  assert.equal(key, 'atlas:centroid:v1:som:fsaaaaaaaaaaaa:mcccccccccccc:r07c12');
  assert.deepEqual(parseCentroidKeyV1(key), { family: 'som', featureSnapshotId: 'fsaaaaaaaaaaaa', modelRevisionId: 'mcccccccccccc', cellId: 'r07c12' });
});

test('kmeans and domain keys use their own cell formats and the domain uses the taxonomy digest', () => {
  assert.equal(buildCentroidKeyV1({ family: 'kmeans', featureSnapshotDigest: FS, modelDigest: M, cell: { index: 3 } }), 'atlas:centroid:v1:kmeans:fsaaaaaaaaaaaa:mcccccccccccc:k003');
  assert.equal(buildCentroidKeyV1({ family: 'domain', featureSnapshotDigest: FS, modelDigest: M, cell: { domainId: 'auth' } }), 'atlas:centroid:v1:domain:fsaaaaaaaaaaaa:mcccccccccccc:auth');
});

test('keys do not collide across cells, model revisions, feature snapshots or families', () => {
  const keys = new Set();
  let count = 0;
  for (const fs of [FS, FS2]) for (const m of [M, M2]) {
    for (let r = 0; r < 4; r += 1) for (let c = 0; c < 4; c += 1) {
      keys.add(buildCentroidKeyV1({ family: 'som', featureSnapshotDigest: fs, modelDigest: m, cell: { row: r, col: c } }));
      count += 1;
    }
    for (let k = 0; k < 4; k += 1) {
      keys.add(buildCentroidKeyV1({ family: 'kmeans', featureSnapshotDigest: fs, modelDigest: m, cell: { index: k } }));
      count += 1;
    }
  }
  assert.equal(keys.size, count);
});

test('a changed timestamp, execution id or member list never changes the key', () => {
  const base = { family: 'som', featureSnapshotDigest: FS, modelDigest: M, cell: { row: 1, col: 2 }, values: [1, 2, 3], memberCount: 5 };
  const a = buildCentroidDescriptorV1({ ...base, createdAt: '2026-10-01T00:00:00Z', graphifyExecutionId: 'exec-1', conceptIds: ['x'] });
  const b = buildCentroidDescriptorV1({ ...base, createdAt: '2026-10-23T12:00:00Z', graphifyExecutionId: 'exec-2', conceptIds: ['y'], memberCount: 9 });
  assert.equal(a.key, b.key);
  assert.notEqual(a.graphifyExecutionId, b.graphifyExecutionId);
});

test('refuses unsupported families and malformed digests, cells, and domain ids', () => {
  assert.throws(() => buildCentroidKeyV1({ family: 'feature', featureSnapshotDigest: FS, modelDigest: M, cell: {} }), /CENTROID_FAMILY_UNSUPPORTED/);
  assert.throws(() => buildCentroidKeyV1({ family: 'som', featureSnapshotDigest: 'sha256:xyz', modelDigest: M, cell: { row: 0, col: 0 } }), /CENTROID_DIGEST_INVALID/);
  assert.throws(() => buildCentroidKeyV1({ family: 'som', featureSnapshotDigest: FS, modelDigest: M, cell: { row: -1, col: 0 } }), /CENTROID_CELL_INVALID/);
  assert.throws(() => buildCentroidKeyV1({ family: 'domain', featureSnapshotDigest: FS, modelDigest: M, cell: { domainId: 'Auth Core' } }), /CENTROID_CELL_INVALID/);
});

test('refuses empty, non-finite, zero-norm and mismatched vectors before publication', () => {
  assert.throws(() => assertPublishableCentroidV1([], 0), /CENTROID_VECTOR_EMPTY/);
  assert.throws(() => assertPublishableCentroidV1([1, NaN], 2), /CENTROID_VECTOR_NONFINITE/);
  assert.throws(() => assertPublishableCentroidV1([0, 0], 2), /CENTROID_VECTOR_ZERO_NORM/);
  assert.throws(() => assertPublishableCentroidV1([1, 2, 3], 2), /CENTROID_VECTOR_LENGTH_MISMATCH/);
  assert.equal(assertPublishableCentroidV1([0.5, 0.5], 2), true);
});

test('decodes little-endian float32 bytes and refuses a length that does not match the dimension', () => {
  const buf = Buffer.alloc(8);
  buf.writeFloatLE(1.5, 0);
  buf.writeFloatLE(-2, 4);
  assert.deepEqual(decodeF32LEV1(buf, 2), [1.5, -2]);
  assert.throws(() => decodeF32LEV1(buf, 64), /CENTROID_VECTOR_LENGTH_MISMATCH/);
  assert.throws(() => decodeF32LEV1('not-bytes', 2), /CENTROID_VECTOR_BYTES_INVALID/);
});

test('descriptor is proposal-only without an admitted workspace revision and never claims authority', () => {
  const d = buildCentroidDescriptorV1({ family: 'kmeans', featureSnapshotDigest: FS, modelDigest: M, cell: { index: 0 }, values: [0.6, 0.8], memberCount: 2, createdAt: 'x', expiresAt: 'y' });
  assert.equal(d.status, 'PROPOSAL_ONLY');
  assert.equal(d.canonicalAuthority, false);
  assert.equal(d.dim, 2);
  assert.equal(d.centroidDigest, centroidDigestV1([0.6, 0.8]));
});

test('descriptor refuses an empty member set', () => {
  assert.throws(() => buildCentroidDescriptorV1({ family: 'som', featureSnapshotDigest: FS, modelDigest: M, cell: { row: 0, col: 0 }, values: [1], memberCount: 0, createdAt: 'x', expiresAt: 'y' }), /CENTROID_MEMBERS_INSUFFICIENT/);
});

test('descriptor binds sourceRevision and taxonomyRevision correctly', () => {
  const d = buildCentroidDescriptorV1({
    family: 'domain',
    featureSnapshotDigest: FS,
    modelDigest: M,
    cell: { domainId: 'database' },
    values: [0.1, 0.2],
    memberCount: 15,
    sourceRevision: 'sha256:source123',
    taxonomyRevision: 'atlas.domain-taxonomy.v1',
    domainId: 'database',
    workspaceRevision: 'sha256:workspace456',
    createdAt: '2026-10-23T00:00:00Z',
    expiresAt: '2026-10-30T00:00:00Z',
  });
  assert.equal(d.sourceRevision, 'sha256:source123');
  assert.equal(d.taxonomyRevision, 'atlas.domain-taxonomy.v1');
  assert.equal(d.status, 'ADMITTED_INPUT');
});

test('decodePostgresLatent64V1 decodes Buffer, Array and JSON string, rejecting non-finite', () => {
  const f32Buf = Buffer.alloc(256);
  for (let i = 0; i < 64; i++) f32Buf.writeFloatLE(0.05 * (i + 1), i * 4);

  const decodedBuf = decodePostgresLatent64V1(f32Buf, 64);
  assert.equal(decodedBuf.length, 64);
  assert.ok(Math.abs(decodedBuf[0] - 0.05) < 1e-6);

  // Array
  const arr = new Array(64).fill(0.1);
  assert.deepEqual(decodePostgresLatent64V1(arr, 64), arr);

  // JSON string
  const jsonStr = JSON.stringify(arr);
  assert.deepEqual(decodePostgresLatent64V1(jsonStr, 64), arr);

  // Mismatched dimension
  assert.throws(() => decodePostgresLatent64V1(Buffer.alloc(128), 64), /CENTROID_LATENT64_LENGTH_MISMATCH/);

  // NaN values
  const nanArr = new Array(64).fill(0.1);
  nanArr[5] = NaN;
  assert.throws(() => decodePostgresLatent64V1(nanArr, 64), /CENTROID_VECTOR_NONFINITE/);
});

test('resolveCentroidLookupKeysV1 returns canonical key and legacy fallback keys', () => {
  const somLookup = resolveCentroidLookupKeysV1({
    family: 'som',
    featureSnapshotDigest: FS,
    modelDigest: M,
    cell: { row: 7, col: 12 },
  });
  assert.equal(somLookup.canonicalKey, 'atlas:centroid:v1:som:fsaaaaaaaaaaaa:mcccccccccccc:r07c12');
  assert.deepEqual(somLookup.fallbackKeys, [
    'atlas:centroid:som:7:12',
    'centroid:som_cell:7:12',
    'centroid:som:7:12',
  ]);

  const kmeansLookup = resolveCentroidLookupKeysV1({
    family: 'kmeans',
    featureSnapshotDigest: FS,
    modelDigest: M,
    cell: { index: 3 },
  });
  assert.equal(kmeansLookup.canonicalKey, 'atlas:centroid:v1:kmeans:fsaaaaaaaaaaaa:mcccccccccccc:k003');
  assert.deepEqual(kmeansLookup.fallbackKeys, [
    'atlas:centroid:kmeans:3',
    'centroid:som:3',
    'taxonomy:clusters:gpu:3',
  ]);

  const domainLookup = resolveCentroidLookupKeysV1({
    family: 'domain',
    featureSnapshotDigest: FS,
    modelDigest: M,
    cell: { domainId: 'retrieval' },
  });
  assert.equal(domainLookup.canonicalKey, 'atlas:centroid:v1:domain:fsaaaaaaaaaaaa:mcccccccccccc:retrieval');
  assert.deepEqual(domainLookup.fallbackKeys, [
    'atlas:centroid:domain:retrieval',
    'taxonomy:clusters:domain:retrieval',
  ]);
});

test('assertSafeToPublishCentroidsV1 refuses NOT_SAFE_TO_PROJECT and missing workspace revision', () => {
  assert.throws(
    () => assertSafeToPublishCentroidsV1({ projectionAdmissionStatus: 'NOT_SAFE_TO_PROJECT', workspaceRevision: 'sha256:workspace' }),
    /CENTROID_PUBLICATION_BLOCKED_NOT_SAFE_TO_PROJECT/
  );
  assert.throws(
    () => assertSafeToPublishCentroidsV1({ projectionAdmissionStatus: 'SAFE_TO_PROJECT', workspaceRevision: null }),
    /CENTROID_PUBLICATION_BLOCKED_UNADMITTED_WORKSPACE/
  );
  assert.equal(
    assertSafeToPublishCentroidsV1({ projectionAdmissionStatus: 'SAFE_TO_PROJECT', workspaceRevision: 'sha256:workspace' }),
    true
  );
});
