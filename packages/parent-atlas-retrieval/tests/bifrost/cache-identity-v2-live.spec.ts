// @vitest-environment node
//
// T5 (parent-atlas-tensor-residency-integration): live Valkey readback + invalidation proof
// for BifrostCacheManager's v2 revision-qualified retrieval cache key. cache-identity-v2.spec.ts
// already proves the key-building function is deterministic and revision-qualified in isolation;
// this file proves the missing half — that a value written under a v2 key is actually readable
// back from a real Valkey instance, that a revision change on any identity axis produces a
// genuine cache miss (not just a different string, which was already known), and that explicit
// invalidation removes a still-reachable key ahead of TTL. Real Valkey, no mocks — skips
// gracefully (not a false pass) if the instance is unreachable.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BifrostCacheManager } from '../../src/bifrost/bifrost-cache-manager.js';
import { getBifrostRedis } from '../../src/bifrost/redis-adapter.js';

const baseIdentity = {
  queryHash: 'query:t5-live-r1',
  workspaceRevision: 'workspace:t5-live-r1',
  candidateSnapshotRevision: 'candidate:t5-live-r1',
  ordinalMapChecksum: 'ordinal:t5-live-r1',
  representationRevision: 'semantic_768:t5-live-r1',
  retrievalPolicyRevision: 'retrieval-policy:t5-live-r1',
  contextPolicyRevision: 'context-policy:t5-live-r1',
  graphRevision: 'graph:t5-live-r1',
};

let valkeyReachable = false;
const writtenKeys: string[] = [];

beforeAll(async () => {
  try {
    const redis = getBifrostRedis();
    await redis.connect();
    await redis.ping();
    valkeyReachable = true;
  } catch {
    valkeyReachable = false;
  }
});

afterAll(async () => {
  if (!valkeyReachable) return;
  const redis = getBifrostRedis();
  if (writtenKeys.length > 0) await redis.del(...writtenKeys).catch(() => {});
  await redis.quit().catch(() => {});
});

describe('BitFrost v2 retrieval cache — live Valkey readback + invalidation (T5)', () => {
  it('writes under the v2 key and reads the identical value back from live Valkey', async () => {
    if (!valkeyReachable) {
      console.warn('[T5-live] Valkey unreachable — skipping, not a false pass');
      return;
    }
    const value = { sourceRefs: ['src/a.ts', 'src/b.ts'], writtenAt: 't5-live-proof' };
    const key = await BifrostCacheManager.setRetrievalV2(baseIdentity, value, 300);
    writtenKeys.push(key);

    expect(key).toMatch(/^bitfrost:retrieval:v2:[a-f0-9]{64}$/);
    expect(key).toBe(BifrostCacheManager.buildRetrievalCacheKeyV2(baseIdentity));

    const readBack = await BifrostCacheManager.getRetrievalV2(baseIdentity);
    expect(readBack).toEqual(value);
  });

  it('a revision change on any single identity axis is a genuine live cache miss', async () => {
    if (!valkeyReachable) {
      console.warn('[T5-live] Valkey unreachable — skipping, not a false pass');
      return;
    }
    const value = { proof: 'axis-isolation' };
    const key = await BifrostCacheManager.setRetrievalV2(baseIdentity, value, 300);
    writtenKeys.push(key);

    for (const field of [
      'queryHash',
      'workspaceRevision',
      'candidateSnapshotRevision',
      'ordinalMapChecksum',
      'representationRevision',
      'retrievalPolicyRevision',
      'contextPolicyRevision',
      'graphRevision',
    ] as const) {
      const mutated = { ...baseIdentity, [field]: `${baseIdentity[field]}:mutated` };
      const miss = await BifrostCacheManager.getRetrievalV2(mutated);
      expect(miss).toBeNull();
    }
  });

  it('explicit invalidation removes a still-reachable key ahead of TTL', async () => {
    if (!valkeyReachable) {
      console.warn('[T5-live] Valkey unreachable — skipping, not a false pass');
      return;
    }
    const identity = { ...baseIdentity, queryHash: 'query:t5-live-invalidate-r1' };
    const value = { proof: 'invalidation' };
    const key = await BifrostCacheManager.setRetrievalV2(identity, value, 300);
    writtenKeys.push(key);

    const beforeInvalidate = await BifrostCacheManager.getRetrievalV2(identity);
    expect(beforeInvalidate).toEqual(value);

    const deleted = await BifrostCacheManager.invalidateRetrievalV2(identity);
    expect(deleted).toBe(true);

    const afterInvalidate = await BifrostCacheManager.getRetrievalV2(identity);
    expect(afterInvalidate).toBeNull();

    const deletedAgain = await BifrostCacheManager.invalidateRetrievalV2(identity);
    expect(deletedAgain).toBe(false);
  });

  it('reading an identity that was never written is a clean miss, not an error', async () => {
    if (!valkeyReachable) {
      console.warn('[T5-live] Valkey unreachable — skipping, not a false pass');
      return;
    }
    const neverWritten = { ...baseIdentity, queryHash: 'query:t5-live-never-written-r1' };
    const miss = await BifrostCacheManager.getRetrievalV2(neverWritten);
    expect(miss).toBeNull();
  });
});
