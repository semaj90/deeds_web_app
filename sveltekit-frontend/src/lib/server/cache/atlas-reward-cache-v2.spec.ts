// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  bifrostKey,
  packetSemanticCacheKeyV2,
  packetSemanticIdentityDigestV2,
  packetSemanticIndexKeyV2,
  type PacketSemanticCacheIdentityV2,
} from '$lib/server/cache-keys.js';
import {
  invalidateBitfrostPacket,
  setPacketCache,
  setPacketCacheV2,
  type PacketCacheEntry,
} from './atlas-reward-cache.js';

const baseIdentity = (over: Partial<PacketSemanticCacheIdentityV2> = {}): PacketSemanticCacheIdentityV2 => ({
  packetKey: 'P1',
  workspaceRevision: 'sha256:ws1',
  sourceRevision: 'sha256:src1',
  representationRevision: 'r1',
  featureRevision: 'f1',
  modelRevision: 'm1',
  producerRevision: 'prod1',
  ...over,
});

const entry = (packetKey: string): PacketCacheEntry => ({
  packetKey,
  featureId: null,
  summary: 's',
  conceptIds: [],
  communityId: null,
  rewardScore: 0,
  cachedAt: '',
});

/** Minimal in-memory stand-in for the ioredis surface these functions use. */
function fakeRedis() {
  const kv = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  const api: any = {
    kv,
    sets,
    multi() {
      const ops: Array<() => void> = [];
      const chain: any = {
        set: (k: string, v: string) => (ops.push(() => kv.set(k, v)), chain),
        sadd: (k: string, m: string) => (ops.push(() => (sets.get(k) ?? sets.set(k, new Set()).get(k)!).add(m)), chain),
        expire: () => chain,
        exec: async () => (ops.forEach((o) => o()), []),
      };
      return chain;
    },
    async set(k: string, v: string) {
      kv.set(k, v);
      return 'OK';
    },
    async smembers(k: string) {
      return [...(sets.get(k) ?? [])];
    },
    async unlink(...keys: string[]) {
      let n = 0;
      for (const k of keys) {
        if (kv.delete(k)) n++;
        if (sets.delete(k)) n++;
      }
      return n;
    },
  };
  return api;
}

describe('BCI-02/03/04 packet semantic cache identity v2', () => {
  it('is deterministic and a full 64-hex digest', () => {
    const a = packetSemanticIdentityDigestV2(baseIdentity());
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(packetSemanticIdentityDigestV2(baseIdentity())).toBe(a);
  });

  it('revision change => different physical key, same packet namespace', () => {
    const k1 = packetSemanticCacheKeyV2(baseIdentity({ representationRevision: 'r1' }));
    const k2 = packetSemanticCacheKeyV2(baseIdentity({ representationRevision: 'r2' }));
    expect(k1).not.toEqual(k2);
    expect(k1.startsWith('bifrost:sem:packet:v2:P1:')).toBe(true);
    expect(k2.startsWith('bifrost:sem:packet:v2:P1:')).toBe(true);
  });

  it('optional ontology/graph revisions participate in the digest', () => {
    const plain = packetSemanticIdentityDigestV2(baseIdentity());
    expect(packetSemanticIdentityDigestV2(baseIdentity({ ontologyRevision: 'o1' }))).not.toBe(plain);
    expect(packetSemanticIdentityDigestV2(baseIdentity({ graphRevision: 'g1' }))).not.toBe(plain);
  });

  it('packet change => different packet namespace', () => {
    expect(packetSemanticCacheKeyV2(baseIdentity({ packetKey: 'P2' }))).not.toEqual(
      packetSemanticCacheKeyV2(baseIdentity({ packetKey: 'P1' })),
    );
  });

  it('reverse-index key depends on packetKey only (stable across revisions)', () => {
    expect(packetSemanticIndexKeyV2('P1')).toBe('bifrost:sem:index:packet:P1');
    expect(packetSemanticIndexKeyV2('P1')).toBe(packetSemanticIndexKeyV2('P1'));
  });

  it('rejects malformed packet keys and missing revision fields (BCI-08 shape guard)', () => {
    for (const bad of ['', '  ', 'P*', 'a b', 'x[0]']) {
      expect(() => packetSemanticIndexKeyV2(bad)).toThrow(TypeError);
    }
    expect(() => packetSemanticIdentityDigestV2(baseIdentity({ modelRevision: '' }))).toThrow(/modelRevision/);
  });

  it('query() and packetV2() namespaces never collide (BCI-09)', () => {
    const q = bifrostKey.semantic.query('deadbeefdeadbeef');
    expect(q).toBe('bifrost:sem:query:deadbeefdeadbeef');
    expect(packetSemanticCacheKeyV2(baseIdentity())).not.toContain(':query:');
  });
});

// Live proof against the real Valkey, synthetic keys only. Opt-in: ATLAS_LIVE_VALKEY=1.
describe.skipIf(!process.env.ATLAS_LIVE_VALKEY)('BCI-06 live disposable-Valkey fixture', () => {
  it('seeds 2 revisions, invalidates by reverse locator, unrelated packet survives', async () => {
    const { default: Redis } = await import('ioredis');
    const redis = new Redis({
      host: process.env.REDIS_HOST ?? '127.0.0.1',
      port: Number(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD ?? 'redis',
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    redis.on('error', () => {});
    await redis.connect();
    const tag = `bci-fixture-${Date.now()}`;
    const pA = `${tag}-A`;
    const pB = `${tag}-B`;
    const touched: string[] = [];
    try {
      const a1 = await setPacketCacheV2(redis, baseIdentity({ packetKey: pA, representationRevision: 'r1' }), entry(pA));
      const a2 = await setPacketCacheV2(redis, baseIdentity({ packetKey: pA, representationRevision: 'r2' }), entry(pA));
      const b1 = await setPacketCacheV2(redis, baseIdentity({ packetKey: pB }), entry(pB));
      touched.push(a1!.key, a2!.key, b1!.key, a1!.indexKey, b1!.indexKey);
      expect(await redis.exists(a1!.key, a2!.key, b1!.key)).toBe(3);
      expect(await redis.scard(a1!.indexKey)).toBe(2);
      expect(await redis.ttl(a1!.key)).toBeGreaterThan(0);

      const res = await invalidateBitfrostPacket(redis, { packetKey: pA });

      expect(res.ok).toBe(true);
      expect(await redis.exists(a1!.key, a2!.key, a1!.indexKey)).toBe(0);
      expect(await redis.exists(b1!.key)).toBe(1); // unrelated packet survives
    } finally {
      if (touched.length) await redis.unlink(...touched);
      await redis.quit();
    }
  });
});

describe('BCI-06 invalidation via reverse locator (fake Redis fixture)', () => {
  it('unlinks every revision of the packet + its index; unrelated packet survives', async () => {
    const redis = fakeRedis();
    const r1 = await setPacketCacheV2(redis, baseIdentity({ representationRevision: 'r1' }), entry('P1'));
    const r2 = await setPacketCacheV2(redis, baseIdentity({ representationRevision: 'r2' }), entry('P1'));
    const other = await setPacketCacheV2(redis, baseIdentity({ packetKey: 'P2' }), entry('P2'));
    await setPacketCache(redis, entry('P1')); // legacy v1 object for same packet
    expect(r1 && r2 && other).toBeTruthy();
    expect(r1!.key).not.toEqual(r2!.key);
    expect(redis.sets.get('bifrost:sem:index:packet:P1')?.size).toBe(2);

    const result = await invalidateBitfrostPacket(redis, { packetKey: 'P1' });

    expect(result.ok).toBe(true);
    expect(redis.kv.has(r1!.key)).toBe(false);
    expect(redis.kv.has(r2!.key)).toBe(false);
    expect(redis.sets.has('bifrost:sem:index:packet:P1')).toBe(false);
    expect(redis.kv.has(bifrostKey.semantic.packet('P1'))).toBe(false); // v1 still handled
    expect(redis.kv.has(other!.key)).toBe(true); // unrelated packet survives
    expect(redis.sets.get('bifrost:sem:index:packet:P2')?.size).toBe(1);
  });

  it('fails open: a Redis error is reported, never thrown', async () => {
    const redis = fakeRedis();
    redis.unlink = async () => {
      throw new Error('boom');
    };
    const result = await invalidateBitfrostPacket(redis, { packetKey: 'P1' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('boom');
  });
});
