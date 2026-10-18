import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveCentroidCacheKey,
  getCachedCentroid,
  setCachedCentroid,
  invalidateCachedCentroid,
} from './valkey-centroid-cache-v1.mjs';

const mockEmbedding = {
  modelArtifactSha256: 'a'.repeat(64),
  tokenizerSha256: 'b'.repeat(64),
  modelFamily: 'gemma',
  promptRecipeRevision: 'eg-task-prefix-v1',
  pooling: 'mean',
  normalization: 'l2',
  dimension: 768,
  metric: 'cosine',
};

const sampleInput = {
  embedding: mockEmbedding,
  taxonomyRevision: 'tax-rev-1',
  clusterSnapshotRevision: 'snap-rev-1',
  clusterId: 'cluster_42',
  clusterManifestChecksum: 'c'.repeat(64),
};

test('deriveCentroidCacheKey creates valid revision-addressed key', () => {
  const key = deriveCentroidCacheKey(sampleInput);
  assert.match(key, /^atlas:centroid:v1:[a-f0-9]{64}:[a-f0-9]{24}:cluster_42$/);
});

test('setCachedCentroid validates dimension and finite values', async () => {
  const store = new Map();
  const mockRedis = {
    set: async (k, v, ex, ttl) => {
      store.set(k, v);
      return 'OK';
    },
    get: async (k) => store.get(k) || null,
    del: async (k) => store.delete(k),
  };

  // Reject wrong dimension
  await assert.rejects(
    () => setCachedCentroid(mockRedis, sampleInput, [0.1, 0.2]),
    { message: /INVALID_CENTROID_DIMENSION/ },
  );

  // Reject NaN / Infinity
  const nanVec = new Array(768).fill(0);
  nanVec[10] = NaN;
  await assert.rejects(
    () => setCachedCentroid(mockRedis, sampleInput, nanVec),
    { message: /NON_FINITE_CENTROID_VALUES/ },
  );

  // Valid 768-D vector roundtrip
  const validVec = new Array(768).fill(0.01);
  const cacheKey = await setCachedCentroid(mockRedis, sampleInput, validVec, 3600);
  assert.ok(store.has(cacheKey));

  const fetched = await getCachedCentroid(mockRedis, sampleInput);
  assert.ok(fetched);
  assert.equal(fetched.centroid.length, 768);
  assert.equal(fetched.descriptor.clusterId, 'cluster_42');

  // Invalidate
  await invalidateCachedCentroid(mockRedis, sampleInput);
  assert.equal(await getCachedCentroid(mockRedis, sampleInput), null);
});
