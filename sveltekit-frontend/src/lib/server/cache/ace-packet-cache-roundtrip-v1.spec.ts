import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stand-in for Valkey. The REAL redisGet/SetRevisionedAcePacketV1 code runs against it, so a "hit" is
// produced by the production write path and validated by the production read path (not a preselected value).
const store = vi.hoisted(() => {
  const m = new Map<string, string>();
  return {
    m,
    writes: [] as Array<{ key: string; ttl: number }>,
    client: {
      get: async (k: string) => m.get(k) ?? null,
      set: async (k: string, v: string, _ex: string, ttl: number) => {
        m.set(k, v);
        store.writes.push({ key: k, ttl });
        return 'OK';
      },
    },
  };
});
vi.mock('./valkey-client.js', () => ({ getValkeyClient: () => store.client }));

import { buildAceBitfrostCacheKeyV1, type AceBitfrostCacheIdentityV1 } from '../atlas/cache/ace-bitfrost-cache-identity-v1.js';
import { acePacketChecksumV1, redisGetRevisionedAcePacketV1, redisSetRevisionedAcePacketV1, type AcePacket } from './ace-packet-cache.js';

const sha = (s: string) => 'sha256:' + createHash('sha256').update(s).digest('hex');

const packet: AcePacket = {
  query: 'competency to stand trial',
  cacheSources: [],
  sourceRefs: ['src/a.ts', 'src/b.ts'],
  rankedCards: [{ id: 'c1', score: 0.9 }],
  failureHints: [],
  nextActions: [],
  promptCacheKey: 'ace:prompt:abc',
  degraded: false,
};
const baseIdentity = (over: Partial<AceBitfrostCacheIdentityV1> = {}): AceBitfrostCacheIdentityV1 => ({
  cacheKind: 'ACE_PACKET',
  artifactKind: 'ace_packet',
  requestHash: 'sha256:req',
  modelRevision: 'embeddinggemma:82f094e4c0e19bc4',
  workspaceRevision: 'workspace:w1',
  sourceRevision: 'sha256:' + 'a'.repeat(64),
  representationId: 'semantic_768',
  representationRevision: 'semantic:r1',
  candidateSnapshotRevision: 'candidate:r1',
  ordinalMapChecksum: 'sha256:ordinal',
  graphRevision: 'graph:r1',
  featureRevision: 'feature:r1',
  producerRevision: 'producer:r1',
  normalizationPolicyRevision: 'context:v1',
  artifactChecksum: acePacketChecksumV1(packet),
  ...over,
});

beforeEach(() => {
  store.m.clear();
  store.writes.length = 0;
});

describe('ACE packet cache: miss -> admitted write -> hit (production read/write code, fake Valkey)', () => {
  it('first lookup misses, write is stored once with a TTL, second lookup hits the identical packet', async () => {
    const id = baseIdentity();
    expect(await redisGetRevisionedAcePacketV1(id)).toBeNull();
    await redisSetRevisionedAcePacketV1(id, packet);
    expect(store.writes).toHaveLength(1);
    expect(store.writes[0].ttl).toBe(3600);
    const hit = await redisGetRevisionedAcePacketV1(id);
    expect(hit).toEqual(packet);
    expect(acePacketChecksumV1(hit as AcePacket)).toBe(id.artifactChecksum); // returned packet checksum == admitted checksum
    expect(store.writes[0].key).toBe(buildAceBitfrostCacheKeyV1(id));
  });

  it('a stale source revision cannot reuse the old entry', async () => {
    await redisSetRevisionedAcePacketV1(baseIdentity(), packet);
    const stale = baseIdentity({ sourceRevision: 'sha256:' + 'b'.repeat(64) });
    expect(buildAceBitfrostCacheKeyV1(stale)).not.toBe(buildAceBitfrostCacheKeyV1(baseIdentity()));
    expect(await redisGetRevisionedAcePacketV1(stale)).toBeNull();
  });

  it('a different workspace revision, embedding recipe, taxonomy/feature revision or assembler revision misses', async () => {
    await redisSetRevisionedAcePacketV1(baseIdentity(), packet);
    for (const over of [
      { workspaceRevision: 'workspace:w2' },
      { representationRevision: 'semantic:r2' },
      { modelRevision: 'embeddinggemma2:b1c5cd86ea5c2150' },
      { featureRevision: 'feature:r2' },
      { producerRevision: 'producer:r2' },
    ] as Array<Partial<AceBitfrostCacheIdentityV1>>) {
      expect(await redisGetRevisionedAcePacketV1(baseIdentity(over))).toBeNull();
    }
  });
});

describe('ACE packet cache: malformed and forged values are rejected', () => {
  it('rejects non-JSON, missing packet, and identity-checksum mismatch under the right key', async () => {
    const id = baseIdentity();
    const key = buildAceBitfrostCacheKeyV1(id);
    store.m.set(key, '{not json');
    expect(await redisGetRevisionedAcePacketV1(id)).toBeNull();
    store.m.set(key, JSON.stringify({ identity: id, identityChecksum: 'sha256:wrong', packet }));
    expect(await redisGetRevisionedAcePacketV1(id)).toBeNull();
    store.m.set(key, JSON.stringify({ identity: id, identityChecksum: 'x' }));
    expect(await redisGetRevisionedAcePacketV1(id)).toBeNull();
    store.m.set(key, JSON.stringify({ packet })); // no identity at all
    expect(await redisGetRevisionedAcePacketV1(id)).toBeNull();
  });

  it('concurrent population of the same identity is idempotent (one key, identical value)', async () => {
    const id = baseIdentity();
    await Promise.all([redisSetRevisionedAcePacketV1(id, packet), redisSetRevisionedAcePacketV1(id, packet), redisSetRevisionedAcePacketV1(id, packet)]);
    expect(store.m.size).toBe(1);
    expect(await redisGetRevisionedAcePacketV1(id)).toEqual(packet);
  });
});

// ---- Known gaps (C5/C1). `it.fails` PASSES while the gap exists and FLIPS to a failure once it is fixed,
// ---- so fixing the gap forces this file to be updated deliberately.
describe('ACE packet cache: known admission gaps (documented, not fixed here)', () => {
  it('C4 (opt-in verifyPacketChecksum): a valid packet passes; tampered top-level or NESTED content is rejected', async () => {
    const id = baseIdentity();
    await redisSetRevisionedAcePacketV1(id, packet);
    expect(await redisGetRevisionedAcePacketV1(id, { verifyPacketChecksum: true })).toEqual(packet);
    const key = buildAceBitfrostCacheKeyV1(id);
    const stored = JSON.parse(store.m.get(key)!);
    for (const tampered of [
      { ...packet, sourceRefs: ['evil.ts'] },
      { ...packet, rankedCards: [{ id: 'c1', score: 0.1 }] }, // nested field only
    ]) {
      store.m.set(key, JSON.stringify({ ...stored, packet: tampered }));
      expect(await redisGetRevisionedAcePacketV1(id, { verifyPacketChecksum: true })).toBeNull();
    }
  });

  it('C4 default read is unchanged (verification is opt-in until all writers record a real packet digest)', async () => {
    const id = baseIdentity();
    await redisSetRevisionedAcePacketV1(id, packet);
    const key = buildAceBitfrostCacheKeyV1(id);
    store.m.set(key, JSON.stringify({ ...JSON.parse(store.m.get(key)!), packet: { ...packet, sourceRefs: ['evil.ts'] } }));
    expect(await redisGetRevisionedAcePacketV1(id)).not.toBeNull();
  });

  it('checksum is key-order independent and sensitive to nested content', () => {
    const reordered = { degraded: false, promptCacheKey: packet.promptCacheKey, nextActions: [], failureHints: [], rankedCards: [{ score: 0.9, id: 'c1' }], sourceRefs: packet.sourceRefs, cacheSources: [], query: packet.query } as AcePacket;
    expect(acePacketChecksumV1(reordered)).toBe(acePacketChecksumV1(packet));
    expect(acePacketChecksumV1({ ...packet, rankedCards: [{ id: 'c1', score: 0.91 }] })).not.toBe(acePacketChecksumV1(packet));
  });

  it.fails('GAP C1: an ACE_PACKET identity without sourceRevision/workspaceRevision is refused', () => {
    const { sourceRevision: _s, workspaceRevision: _w, ...incomplete } = baseIdentity();
    expect(() => buildAceBitfrostCacheKeyV1(incomplete as AceBitfrostCacheIdentityV1)).toThrow();
  });

  it.fails('GAP C5: the cache identity binds an authorization/workspace-scope principal', () => {
    const keys = Object.keys(baseIdentity());
    expect(keys.some((k) => /auth|principal|user|tenant|scope/i.test(k))).toBe(true);
  });
});
