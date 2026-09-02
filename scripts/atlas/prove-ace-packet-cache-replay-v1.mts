import {
  buildRevisionedAcePacketCacheKeyV1,
  redisGetRevisionedAcePacketV1,
  redisSetRevisionedAcePacketV1,
  type AcePacket,
} from '../../sveltekit-frontend/src/lib/server/cache/ace-packet-cache.js';
import { getValkeyClient } from '../../sveltekit-frontend/src/lib/server/cache/valkey-client.js';

const nonce = Date.now().toString(36);
const identity = {
  cacheKind: 'ACE_PACKET' as const,
  artifactKind: 'ace_packet_replay',
  representationId: 'semantic_768',
  representationRevision: 'semantic:replay:' + nonce,
  candidateSnapshotRevision: 'candidate:replay:' + nonce,
  ordinalMapChecksum: 'sha256:ordinal',
  graphRevision: 'graph:replay:' + nonce,
  featureRevision: 'feature:replay:' + nonce,
  producerRevision: 'producer:replay:' + nonce,
  normalizationPolicyRevision: 'context:v1',
  artifactChecksum: 'sha256:packet:' + nonce,
};
const staleIdentity = { ...identity, artifactChecksum: identity.artifactChecksum + ':changed' };
const packet: AcePacket = {
  query: 'disposable ACE packet replay',
  cacheSources: ['test'],
  sourceRefs: ['src/replay.ts'],
  rankedCards: [{ cardId: 'card:replay:1' }],
  failureHints: [],
  nextActions: [],
  promptCacheKey: 'prompt:replay:' + nonce,
  degraded: false,
};
const client = getValkeyClient();
const key = buildRevisionedAcePacketCacheKeyV1(identity);

try {
  await client.connect();
  const before = await redisGetRevisionedAcePacketV1(identity);
  await redisSetRevisionedAcePacketV1(identity, packet, 120);
  const hit = await redisGetRevisionedAcePacketV1(identity);
  const stale = await redisGetRevisionedAcePacketV1(staleIdentity);
  if (before !== null || hit?.promptCacheKey !== packet.promptCacheKey || stale !== null) {
    throw new Error('ACE packet cache replay admission failed');
  }
  console.log(JSON.stringify({
    status: 'ACE_PACKET_CACHE_REPLAY_PROVEN',
    missBeforeWrite: before === null,
    hitAfterWrite: hit !== null,
    staleLineageMiss: stale === null,
    cacheWritePerformed: true,
    canonicalWritesPerformed: false,
    canonicalAuthority: false,
  }));
} finally {
  await client.del(key).catch(() => undefined);
  await client.quit().catch(() => undefined);
}
