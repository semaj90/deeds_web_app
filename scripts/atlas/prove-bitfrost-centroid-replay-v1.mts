import { AggressiveRedisCache } from '../../sveltekit-frontend/src/lib/server/cache/redis-cache-aggressive.js';
import { buildAceBitfrostCacheKeyV1 } from '../../sveltekit-frontend/src/lib/server/atlas/cache/ace-bitfrost-cache-identity-v1.js';
import { getValkeyClient } from '../../sveltekit-frontend/src/lib/server/cache/valkey-client.js';

const nonce = Date.now().toString(36);
const identity = {
  cacheKind: 'CENTROID' as const,
  artifactKind: 'replay_centroid',
  representationId: 'semantic_768',
  representationRevision: 'semantic:replay:' + nonce,
  candidateSnapshotRevision: 'candidate:replay:' + nonce,
  ordinalMapChecksum: 'sha256:replay-ordinal',
  graphRevision: 'graph:replay:' + nonce,
  featureRevision: 'feature:replay:' + nonce,
  producerRevision: 'producer:replay:' + nonce,
  normalizationPolicyRevision: 'l2-renorm:v1',
  artifactChecksum: 'sha256:replay-artifact',
};
const staleIdentity = { ...identity, candidateSnapshotRevision: identity.candidateSnapshotRevision + ':changed' };
const centroid = new Float32Array(768);
centroid[0] = 1;
const cache = new AggressiveRedisCache();
const client = getValkeyClient();
const key = buildAceBitfrostCacheKeyV1(identity);

try {
  await cache.connect();
  const before = await cache.getRevisionedCentroid(identity);
  await cache.setRevisionedCentroid(identity, centroid, 120);
  const hit = await cache.getRevisionedCentroid(identity);
  const stale = await cache.getRevisionedCentroid(staleIdentity);
  if (before !== null || hit === null || stale !== null) {
    throw new Error('BitFrost centroid replay admission failed');
  }
  console.log(JSON.stringify({
    status: 'BITFROST_CENTROID_REPLAY_PROVEN',
    missBeforeWrite: before === null,
    hitAfterWrite: hit !== null,
    staleRevisionMiss: stale === null,
    dimension: hit?.centroid.length ?? 0,
    cacheWritePerformed: true,
    canonicalWritesPerformed: false,
    canonicalAuthority: false,
  }));
} finally {
  await client.del(key).catch(() => undefined);
  await cache.disconnect().catch(() => undefined);
  await client.quit().catch(() => undefined);
}
