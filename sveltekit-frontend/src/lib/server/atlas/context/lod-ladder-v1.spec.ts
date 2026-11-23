import { describe, expect, it, vi } from 'vitest';
import {
  createLodConsumerLease,
  expandLOD,
  isServiceWorkerCacheableTier,
  type LodLadderCandidate,
} from './lod-ladder-v1.js';

function makeCandidate(currentTier: LodLadderCandidate['currentTier'] = 'L1_FEATURE_CARD'): LodLadderCandidate {
  return {
    candidateId: 'cand:lod:001',
    currentTier,
    data: { cardId: 'card:1' },
  };
}

describe('lod-ladder-v1 SSR/CSR residency guards', () => {
  it('rejects pre-aborted and in-flight aborted expansions', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      expandLOD(makeCandidate(), 'L3_SEMANTIC_VECTOR', async () => ({ ok: true }), {
        signal: controller.signal,
      }),
    ).rejects.toThrow('LOD_EXPANSION_ABORTED');

    const midFlight = new AbortController();
    await expect(
      expandLOD(
        makeCandidate(),
        'L3_SEMANTIC_VECTOR',
        async () => {
          midFlight.abort();
          return { vectorRef: 'vec:1' };
        },
        { signal: midFlight.signal },
      ),
    ).rejects.toThrow('LOD_EXPANSION_ABORTED');
  });

  it('enforces payload byte budget and rejects invalid budgets', async () => {
    await expect(
      expandLOD(makeCandidate(), 'L2_LATENT_VECTOR', async () => ({ a: 1 }), { maxBytes: 0 }),
    ).rejects.toThrow('LOD_BYTE_BUDGET_INVALID');

    await expect(
      expandLOD(
        makeCandidate(),
        'L2_LATENT_VECTOR',
        async () => ({ blob: 'x'.repeat(256) }),
        { maxBytes: 64 },
      ),
    ).rejects.toThrow(/LOD_BYTE_BUDGET_EXCEEDED/);
  });

  it('enforces revision and checksum verification when requested', async () => {
    await expect(
      expandLOD(makeCandidate(), 'L3_SEMANTIC_VECTOR', async () => ({ payload: 1 }), {
        requireRevision: true,
      }),
    ).rejects.toThrow('LOD_STALE_REVISION:MISSING');

    await expect(
      expandLOD(
        makeCandidate(),
        'L3_SEMANTIC_VECTOR',
        async () => ({ sourceRevision: 'sha256:old', checksum: 'sha256:abc' }),
        { expectedRevision: 'sha256:new' },
      ),
    ).rejects.toThrow('LOD_STALE_REVISION');

    await expect(
      expandLOD(
        makeCandidate(),
        'L3_SEMANTIC_VECTOR',
        async () => ({ sourceRevision: 'sha256:new', checksum: 'sha256:bad' }),
        { expectedRevision: 'sha256:new', expectedChecksum: 'sha256:good' },
      ),
    ).rejects.toThrow('LOD_CHECKSUM_MISMATCH');

    const ok = await expandLOD(
      makeCandidate(),
      'L3_SEMANTIC_VECTOR',
      async () => ({ sourceRevision: 'sha256:new', checksum: 'sha256:good' }),
      { expectedRevision: 'sha256:new', expectedChecksum: 'sha256:good', requireRevision: true },
    );
    expect(ok.currentTier).toBe('L3_SEMANTIC_VECTOR');
  });

  it('forbids L7_MODEL_STATE and hidden/KV runtime keys by default', async () => {
    await expect(
      expandLOD(makeCandidate(), 'L7_MODEL_STATE', async () => ({ tokens: [] })),
    ).rejects.toThrow('LOD_L7_MODEL_STATE_FORBIDDEN');

    await expect(
      expandLOD(makeCandidate(), 'L4_ONTOLOGY_TUPLES', async () => ({ kv_cache: [1, 2, 3] })),
    ).rejects.toThrow('LOD_FORBIDDEN_RUNTIME_STATE:kv_cache');

    expect(isServiceWorkerCacheableTier('L3_SEMANTIC_VECTOR')).toBe(true);
    expect(isServiceWorkerCacheableTier('L7_MODEL_STATE')).toBe(false);
  });

  it('releases consumer lease resources only once when the last consumer finishes', () => {
    const onReleaseLast = vi.fn();
    const lease = createLodConsumerLease(onReleaseLast);

    const rel1 = lease.acquire();
    const rel2 = lease.acquire();
    expect(lease.activeConsumers()).toBe(2);

    rel1();
    rel1(); // idempotent duplicate release
    expect(lease.activeConsumers()).toBe(1);
    expect(onReleaseLast).not.toHaveBeenCalled();

    rel2();
    expect(lease.activeConsumers()).toBe(0);
    expect(onReleaseLast).toHaveBeenCalledTimes(1);
  });
});
