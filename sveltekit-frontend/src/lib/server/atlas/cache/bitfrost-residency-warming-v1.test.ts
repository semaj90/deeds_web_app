import { describe, expect, it } from 'vitest';
import type Redis from 'ioredis';
import { buildAcePacketV3, type AceCacheExpectationV3, type AcePacketV3 } from '@deeds/parent-atlas';
import { AcePacketReader } from '../../ace/ace-packet-reader.js';
import { AcePacketWriter } from '../../ace/ace-packet-writer.js';
import {
  MAX_HOTNESS_SNAPSHOT_TOP_N,
  buildBucketWarmPlanV1,
  buildHotnessSnapshotV1,
  computeResidencyScoreV1,
  executeBucketWarmPlanV1,
  readAcePacketV3FromBitfrostV1,
  getOrWarmCacheAsideV1,
  getTopHeatKeysV1,
  recordHeatSignalV1,
  writeAcePacketV3ToBitfrostV1,
  type HotArtifactV1,
} from './bitfrost-residency-warming-v1.js';
import {
  buildAceBitfrostCacheKeyV1,
  type AceBitfrostCacheIdentityV1,
} from './ace-bitfrost-cache-identity-v1.js';

/** Minimal in-memory fake covering only the ioredis surface this module uses. */
class FakeRedis {
  strings = new Map<string, string>();
  zsets = new Map<string, Map<string, number>>();
  failGet = false;
  failSet = false;

  async get(key: string): Promise<string | null> {
    if (this.failGet) throw new Error('FAKE_REDIS_GET_FAILURE');
    return this.strings.get(key) ?? null;
  }

  async set(key: string, value: string, _ex: 'EX', _ttl: number): Promise<'OK'> {
    if (this.failSet) throw new Error('FAKE_REDIS_SET_FAILURE');
    this.strings.set(key, value);
    return 'OK';
  }

  async zadd(key: string, score: number, member: string): Promise<number> {
    const set = this.zsets.get(key) ?? new Map<string, number>();
    const isNew = !set.has(member);
    set.set(member, score);
    this.zsets.set(key, set);
    return isNew ? 1 : 0;
  }

  async zcard(key: string): Promise<number> {
    return this.zsets.get(key)?.size ?? 0;
  }

  async zremrangebyrank(key: string, start: number, stop: number): Promise<number> {
    const set = this.zsets.get(key);
    if (!set) return 0;
    const sorted = [...set.entries()].sort((a, b) => a[1] - b[1]);
    const toRemove = sorted.slice(start, stop + 1);
    for (const [member] of toRemove) set.delete(member);
    return toRemove.length;
  }

  async zrevrangebyscore(
    key: string,
    _max: string,
    _min: string,
    _withscores: 'WITHSCORES',
    _limitKw: 'LIMIT',
    offset: number,
    count: number,
  ): Promise<string[]> {
    const set = this.zsets.get(key);
    if (!set) return [];
    const sorted = [...set.entries()].sort((a, b) => b[1] - a[1]);
    const page = sorted.slice(offset, offset + count);
    return page.flatMap(([member, score]) => [member, String(score)]);
  }
}

function makeArtifact(key: string, score: number, kind: HotArtifactV1['kind'] = 'packet'): HotArtifactV1 {
  return {
    key,
    kind,
    residencyScore: computeResidencyScoreV1({
      frequency: score,
      breadth: 1,
      recencyMs: 0,
      reconstructionCostMs: 0,
      latencySavedMs: 0,
      byteCost: 0,
    }),
  };
}

function makeCurrentAcePacketV3(): AcePacketV3 {
  const sha = (char: string) => `sha256:${char.repeat(64)}`;
  const section = <T>(
    data: T,
    status: 'CURRENT' | 'HINT' | 'STALE' | 'PENDING' = 'CURRENT',
    revision: string | null = 'r1',
  ) => ({
    status, revision, evidence_refs: [], data,
  });
  return buildAcePacketV3({
    base: {
      packet_revision: 'packet-rev-1',
      producer_revision: 'producer-rev-1',
      envelope: {
        packet_key: 'packet:cache-proof', source_ref: 'src/cache-proof.ts',
        canonical_source_ref: 'src/cache-proof.ts', feature_id: 'feature:cache-proof',
        source_revision: 'source-rev-1',
      },
      hypergraph: null,
    },
    identity: {
      packet_key: 'packet:cache-proof', source_ref: 'src/cache-proof.ts',
      workspace_revision: 'workspace-rev-1', source_revision: 'source-rev-1',
      packet_revision: 'packet-rev-1', producer_revision: 'producer-rev-1',
      representation_id: 'semantic_768', representation_revision: 'representation-rev-1',
      feature_revision: 'feature-rev-1', graph_revision: 'graph-rev-1',
      symbol_version_id: null, tree_node_id: null,
    },
    source: section({ language: 'typescript', source_digest: sha('a'), start_byte: null, end_byte: null, ast_state: 'REVISION_QUALIFIED' }, 'CURRENT', 'source-rev-1'),
    semantic: section({
      summary: section({ text: null, input_digest: null, model_revision: null }, 'PENDING', null),
      embedding: section({
        model: 'EmbeddingGemma', dimension: 768, input_digest: sha('b'),
        embedding_digest: sha('c'), vector_ref: { kind: 'CANDIDATE_ORDINAL', value: '0' },
      }, 'CURRENT', 'representation-rev-1'),
      keywords: [], entities: [], concept_ids: [], domain_class: null,
    }),
    topology: section({ community_id: null, pagerank: null, som: null, kmeans_cluster: null, centroid_refs: [] }, 'CURRENT', 'graph-rev-1'),
    residency: section({ tier: 'COLD', lod: 'IDENTITY', utility: null, prefetch_reasons: [], cache_identity_checksum: null }, 'PENDING', null),
    evidence: section({ refs: [], contradictions: [], stale_refs: [] }),
  });
}

function cacheIdentityForPacket(packet: AcePacketV3): AceBitfrostCacheIdentityV1 {
  return {
    cacheKind: 'ACE_PACKET', artifactKind: 'ace_packet_v3',
    workspaceRevision: packet.identity.workspace_revision,
    sourceRevision: packet.identity.source_revision,
    packetRevision: packet.identity.packet_revision,
    representationId: packet.identity.representation_id,
    representationRevision: packet.identity.representation_revision!,
    candidateSnapshotRevision: 'candidate-snapshot-1', ordinalMapChecksum: 'sha256:ordinal-map',
    graphRevision: packet.identity.graph_revision!, featureRevision: packet.identity.feature_revision!,
    producerRevision: packet.identity.producer_revision, normalizationPolicyRevision: 'l2-renormalize-v1',
    artifactChecksum: packet.integrity.packet_checksum,
  };
}

function expectationForPacket(packet: AcePacketV3): AceCacheExpectationV3 {
  return {
    packet_key: packet.identity.packet_key, source_ref: packet.identity.source_ref,
    source_revision: packet.identity.source_revision, workspace_revision: packet.identity.workspace_revision,
    representation_id: packet.identity.representation_id,
    representation_revision: packet.identity.representation_revision,
    feature_revision: packet.identity.feature_revision, graph_revision: packet.identity.graph_revision,
    producer_revision: packet.identity.producer_revision, packet_checksum: packet.integrity.packet_checksum,
  };
}

describe('computeResidencyScoreV1', () => {
  it('is pure and deterministic', () => {
    const input = {
      frequency: 10,
      breadth: 3,
      recencyMs: 5000,
      reconstructionCostMs: 200,
      latencySavedMs: 150,
      byteCost: 4096,
    };
    const a = computeResidencyScoreV1(input);
    const b = computeResidencyScoreV1(input);
    expect(a.score).toBe(b.score);
  });

  it('rewards frequency, breadth, recency, and latency saved', () => {
    const base = computeResidencyScoreV1({
      frequency: 1,
      breadth: 1,
      recencyMs: 1_000_000,
      reconstructionCostMs: 0,
      latencySavedMs: 0,
      byteCost: 0,
    });
    const hotter = computeResidencyScoreV1({
      frequency: 100,
      breadth: 10,
      recencyMs: 0,
      reconstructionCostMs: 0,
      latencySavedMs: 500,
      byteCost: 0,
    });
    expect(hotter.score).toBeGreaterThan(base.score);
  });

  it('penalizes byte cost with the default weights', () => {
    const cheap = computeResidencyScoreV1({
      frequency: 5,
      breadth: 1,
      recencyMs: 0,
      reconstructionCostMs: 0,
      latencySavedMs: 0,
      byteCost: 10,
    });
    const expensive = computeResidencyScoreV1({
      frequency: 5,
      breadth: 1,
      recencyMs: 0,
      reconstructionCostMs: 0,
      latencySavedMs: 0,
      byteCost: 10_000_000,
    });
    expect(expensive.score).toBeLessThan(cheap.score);
  });
});

describe('buildHotnessSnapshotV1', () => {
  it('selects a deterministic, score-descending top-N with stable key tie-break', () => {
    const candidates = [
      makeArtifact('b', 5),
      makeArtifact('a', 5),
      makeArtifact('c', 9),
    ];
    const snapshot = buildHotnessSnapshotV1(candidates, 2);
    expect(snapshot.artifacts.map((a) => a.key)).toEqual(['c', 'a']);
    expect(snapshot.candidateCount).toBe(3);
    expect(snapshot.topN).toBe(2);
  });

  it('never exceeds the hard top-N ceiling regardless of requested size', () => {
    const candidates = Array.from({ length: 10 }, (_, i) => makeArtifact(`k${i}`, i));
    const snapshot = buildHotnessSnapshotV1(candidates, MAX_HOTNESS_SNAPSHOT_TOP_N + 1_000_000);
    expect(snapshot.topN).toBeLessThanOrEqual(MAX_HOTNESS_SNAPSHOT_TOP_N);
  });

  it('re-running with identical input yields an identical snapshot (order-stable)', () => {
    const candidates = [makeArtifact('x', 1), makeArtifact('y', 1), makeArtifact('z', 2)];
    const first = buildHotnessSnapshotV1(candidates, 3);
    const second = buildHotnessSnapshotV1(candidates, 3);
    expect(first.artifacts.map((a) => a.key)).toEqual(second.artifacts.map((a) => a.key));
  });
});

describe('buildBucketWarmPlanV1', () => {
  it('never targets the full corpus — bounded even with a huge candidate set', () => {
    const candidates = Array.from({ length: 200_000 }, (_, i) => makeArtifact(`packet-${i}`, i));
    const snapshot = buildHotnessSnapshotV1(candidates, 60_000);
    const plan = buildBucketWarmPlanV1(snapshot, { maxEntries: 500 });
    expect(plan.entries.length).toBeLessThanOrEqual(500);
    expect(plan.entries.length).toBeLessThan(candidates.length);
  });

  it('splits into disjoint, deterministic buckets that together cover the snapshot', () => {
    const candidates = Array.from({ length: 10 }, (_, i) => makeArtifact(`p${i}`, 10 - i));
    const snapshot = buildHotnessSnapshotV1(candidates, 10);
    const bucket0 = buildBucketWarmPlanV1(snapshot, { bucket: 0, bucketCount: 2, maxEntries: 100 });
    const bucket1 = buildBucketWarmPlanV1(snapshot, { bucket: 1, bucketCount: 2, maxEntries: 100 });
    const keys0 = new Set(bucket0.entries.map((e) => e.key));
    const keys1 = new Set(bucket1.entries.map((e) => e.key));
    for (const key of keys0) expect(keys1.has(key)).toBe(false);
    expect(keys0.size + keys1.size).toBe(snapshot.artifacts.length);
  });

  it('maps each entry to the existing shared BitFrost key builders, not a hand-built string', () => {
    const snapshot = buildHotnessSnapshotV1([makeArtifact('pk-1', 1, 'packet')], 1);
    const plan = buildBucketWarmPlanV1(snapshot);
    expect(plan.entries[0]!.cacheKey).toBe('bifrost:sem:packet:pk-1');
  });
});

describe('getOrWarmCacheAsideV1', () => {
  it('returns the cached value without calling the reconstructor on a hit', async () => {
    const redis = new FakeRedis();
    await redis.set('k', JSON.stringify({ v: 'cached' }), 'EX', 60);
    let reconstructed = false;
    const result = await getOrWarmCacheAsideV1(
      redis as unknown as Redis,
      'k',
      async () => {
        reconstructed = true;
        return { v: 'fresh' };
      },
      (v) => JSON.stringify(v),
      (raw) => JSON.parse(raw),
      60,
    );
    expect(result.source).toBe('cache');
    expect(result.value).toEqual({ v: 'cached' });
    expect(reconstructed).toBe(false);
  });

  it('reconstructs from the canonical source and warms the cache on a miss', async () => {
    const redis = new FakeRedis();
    const result = await getOrWarmCacheAsideV1(
      redis as unknown as Redis,
      'k',
      async () => ({ v: 'fresh' }),
      (v) => JSON.stringify(v),
      (raw) => JSON.parse(raw),
      60,
    );
    expect(result.source).toBe('reconstructed');
    expect(result.value).toEqual({ v: 'fresh' });
    expect(redis.strings.get('k')).toBe(JSON.stringify({ v: 'fresh' }));
  });

  it('never fabricates a value: a null reconstruction stays a genuine miss', async () => {
    const redis = new FakeRedis();
    const result = await getOrWarmCacheAsideV1(
      redis as unknown as Redis,
      'k',
      async () => null,
      (v) => JSON.stringify(v),
      (raw) => JSON.parse(raw),
      60,
    );
    expect(result.source).toBe('miss');
    expect(result.value).toBeNull();
    expect(redis.strings.has('k')).toBe(false);
  });

  it('falls back to reconstruction when the cache read itself fails, rather than treating an error as absence', async () => {
    const redis = new FakeRedis();
    redis.failGet = true;
    const result = await getOrWarmCacheAsideV1(
      redis as unknown as Redis,
      'k',
      async () => ({ v: 'fresh' }),
      (v) => JSON.stringify(v),
      (raw) => JSON.parse(raw),
      60,
    );
    expect(result.source).toBe('reconstructed');
  });

  it('returns canonical reconstruction when cache warming fails', async () => {
    const redis = new FakeRedis();
    redis.failSet = true;
    const result = await getOrWarmCacheAsideV1(
      redis as unknown as Redis,
      'k',
      async () => ({ v: 'fresh' }),
      (v) => JSON.stringify(v),
      (raw) => JSON.parse(raw),
      60,
    );
    expect(result.source).toBe('reconstructed');
    expect(result.value).toEqual({ v: 'fresh' });
    expect(redis.strings.has('k')).toBe(false);
  });
});

describe('executeBucketWarmPlanV1', () => {
  it('warms every reconstructible entry and reports writesPerformed: false', async () => {
    const redis = new FakeRedis();
    const snapshot = buildHotnessSnapshotV1(
      [makeArtifact('p1', 3), makeArtifact('p2', 2), makeArtifact('p3', 1)],
      3,
    );
    const plan = buildBucketWarmPlanV1(snapshot);
    const result = await executeBucketWarmPlanV1(
      redis as unknown as Redis,
      plan,
      {
        reconstruct: async (entry) => ({ key: entry.key }),
        serialize: (v) => JSON.stringify(v),
      },
    );
    expect(result.attempted).toBe(3);
    expect(result.warmed).toBe(3);
    expect(result.missed).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.writesPerformed).toBe(false);
    expect(redis.strings.get('bifrost:sem:packet:p1')).toBe(JSON.stringify({ key: 'p1' }));
  });

  it('counts a null reconstruction as a miss, never as a fabricated warm', async () => {
    const redis = new FakeRedis();
    const snapshot = buildHotnessSnapshotV1([makeArtifact('p1', 1)], 1);
    const plan = buildBucketWarmPlanV1(snapshot);
    const result = await executeBucketWarmPlanV1(
      redis as unknown as Redis,
      plan,
      { reconstruct: async () => null, serialize: (v) => JSON.stringify(v) },
    );
    expect(result.missed).toBe(1);
    expect(result.warmed).toBe(0);
    expect(redis.strings.size).toBe(0);
  });

  it('isolates a reconstructor failure to that entry instead of aborting the whole plan', async () => {
    const redis = new FakeRedis();
    const snapshot = buildHotnessSnapshotV1([makeArtifact('ok', 2), makeArtifact('bad', 1)], 2);
    const plan = buildBucketWarmPlanV1(snapshot);
    const result = await executeBucketWarmPlanV1(
      redis as unknown as Redis,
      plan,
      {
        reconstruct: async (entry) => {
          if (entry.key === 'bad') throw new Error('boom');
          return { key: entry.key };
        },
        serialize: (v) => JSON.stringify(v),
      },
    );
    expect(result.warmed).toBe(1);
    expect(result.failed).toBe(1);
  });
});

describe('bounded heat ZSETs', () => {
  it('records and ranks heat signals descending', async () => {
    const redis = new FakeRedis();
    await recordHeatSignalV1(redis as unknown as Redis, 'packet', 'p1', 5);
    await recordHeatSignalV1(redis as unknown as Redis, 'packet', 'p2', 9);
    const top = await getTopHeatKeysV1(redis as unknown as Redis, 'packet', 10);
    expect(top.map((t) => t.key)).toEqual(['p2', 'p1']);
  });

  it('prunes the ZSET when it exceeds the bounded maximum (no unbounded growth)', async () => {
    const redis = new FakeRedis();
    // Directly seed past the bound to prove pruning happens on the next write,
    // matching the existing REWARD_ZSET_MAX pattern in atlas-reward-cache.ts.
    for (let i = 0; i < 10_001; i++) {
      redis.zsets.set('bitfrost:heat:packet', redis.zsets.get('bitfrost:heat:packet') ?? new Map());
      redis.zsets.get('bitfrost:heat:packet')!.set(`seed-${i}`, i);
    }
    await recordHeatSignalV1(redis as unknown as Redis, 'packet', 'newest', 99_999);
    const size = await redis.zcard('bitfrost:heat:packet');
    expect(size).toBeLessThanOrEqual(10_000);
  });

  it('fails open to an empty ranking on a Redis error', async () => {
    const redis = new FakeRedis();
    (redis as unknown as { zrevrangebyscore: () => Promise<never> }).zrevrangebyscore = async () => {
      throw new Error('down');
    };
    const top = await getTopHeatKeysV1(redis as unknown as Redis, 'query', 10);
    expect(top).toEqual([]);
  });
});

describe('ACE packet v3 BitFrost cache owner', () => {
  it('exposes the guarded v3 cache owner through the existing ACE reader and writer', async () => {
    const redis = new FakeRedis();
    const packet = makeCurrentAcePacketV3();
    const cacheIdentity = cacheIdentityForPacket(packet);
    const embedAllowedPacketKeys = new Set([packet.identity.packet_key]);
    const writer = new AcePacketWriter();
    const reader = new AcePacketReader();

    const write = await writer.writeRevisionQualifiedV3ToBitfrost(redis as unknown as Redis, {
      packet, cacheIdentity, embedAllowedPacketKeys,
    });
    expect(write.status).toBe('WRITTEN');
    const read = await reader.readRevisionQualifiedV3FromBitfrost(redis as unknown as Redis, {
      cacheIdentity, expected: expectationForPacket(packet), embedAllowedPacketKeys,
    });
    expect(read.status).toBe('HIT');
  });

  it('writes and reads only embed-admitted, fully revisioned packets through the shared identity key', async () => {
    const redis = new FakeRedis();
    const packet = makeCurrentAcePacketV3();
    const cacheIdentity = cacheIdentityForPacket(packet);
    const embedAllowedPacketKeys = new Set([packet.identity.packet_key]);

    const write = await writeAcePacketV3ToBitfrostV1(redis as unknown as Redis, {
      packet, cacheIdentity, embedAllowedPacketKeys,
    });
    expect(write.status).toBe('WRITTEN');
    if (write.status !== 'WRITTEN') return;
    expect(write.cacheKey).toContain('atlas:bitfrost:v1:ace_packet:ace_packet_v3');

    const read = await readAcePacketV3FromBitfrostV1(redis as unknown as Redis, {
      cacheIdentity, expected: expectationForPacket(packet), embedAllowedPacketKeys,
    });
    expect(read.status).toBe('HIT');
    if (read.status === 'HIT') expect(read.packet.integrity.packet_checksum).toBe(packet.integrity.packet_checksum);
  });

  it('blocks unadmitted keys and invalidates stale or malformed cache entries', async () => {
    const redis = new FakeRedis();
    const packet = makeCurrentAcePacketV3();
    const cacheIdentity = cacheIdentityForPacket(packet);
    const denied = await writeAcePacketV3ToBitfrostV1(redis as unknown as Redis, {
      packet, cacheIdentity, embedAllowedPacketKeys: new Set(),
    });
    expect(denied).toEqual({ status: 'BLOCKED', cacheKey: null, reason: 'PACKET_NOT_EMBED_ALLOWED' });
    expect(redis.strings.size).toBe(0);

    const key = (await writeAcePacketV3ToBitfrostV1(redis as unknown as Redis, {
      packet, cacheIdentity, embedAllowedPacketKeys: new Set([packet.identity.packet_key]),
    }));
    expect(key.status).toBe('WRITTEN');
    if (key.status !== 'WRITTEN') return;
    redis.strings.set(key.cacheKey, '{malformed');
    const miss = await readAcePacketV3FromBitfrostV1(redis as unknown as Redis, {
      cacheIdentity, expected: expectationForPacket(packet),
      embedAllowedPacketKeys: new Set([packet.identity.packet_key]),
    });
    expect(miss).toEqual({ status: 'MISS', cacheKey: key.cacheKey, reason: 'UNPARSEABLE' });
  });

  it('fails closed when the composed packet is only a hint or the key checksum drifts', async () => {
    const redis = new FakeRedis();
    const currentPacket = makeCurrentAcePacketV3();
    const { integrity: _integrity, ...packetBody } = currentPacket;
    const packet = buildAcePacketV3({
      ...packetBody,
      semantic: {
        ...packetBody.semantic,
        data: {
          ...packetBody.semantic.data,
          embedding: { ...packetBody.semantic.data.embedding, status: 'HINT' },
        },
      },
    });
    const cacheIdentity = cacheIdentityForPacket(packet);
    const hintWrite = await writeAcePacketV3ToBitfrostV1(redis as unknown as Redis, {
      packet, cacheIdentity,
      embedAllowedPacketKeys: new Set([packet.identity.packet_key]),
    });
    expect(hintWrite).toEqual({ status: 'BLOCKED', cacheKey: null, reason: 'EMBEDDING_NOT_CURRENT' });

    const wrongChecksum = { ...cacheIdentity, artifactChecksum: 'sha256:' + 'f'.repeat(64) };
    const driftWrite = await writeAcePacketV3ToBitfrostV1(redis as unknown as Redis, {
      packet: makeCurrentAcePacketV3(), cacheIdentity: wrongChecksum,
      embedAllowedPacketKeys: new Set(['packet:cache-proof']),
    });
    expect(driftWrite).toEqual({ status: 'BLOCKED', cacheKey: null, reason: 'IDENTITY_MISMATCH:artifactChecksum' });
    expect(redis.strings.size).toBe(0);
  });

  it('treats a packet stored under a key with a different packet revision as a cache miss', async () => {
    const redis = new FakeRedis();
    const packet = makeCurrentAcePacketV3();
    const identity = { ...cacheIdentityForPacket(packet), packetRevision: 'wrong-packet-revision' };
    const cacheKey = buildAceBitfrostCacheKeyV1(identity);
    redis.strings.set(cacheKey, JSON.stringify(packet));

    const result = await readAcePacketV3FromBitfrostV1(redis as unknown as Redis, {
      cacheIdentity: identity,
      expected: expectationForPacket(packet),
      embedAllowedPacketKeys: new Set([packet.identity.packet_key]),
    });
    expect(result).toEqual({ status: 'MISS', cacheKey, reason: 'IDENTITY_MISMATCH:packetRevision' });
  });
});
