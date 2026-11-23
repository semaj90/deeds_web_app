import { describe, expect, it } from 'vitest';
import {
  createVramPressureEvictionCoordinatorV1,
  SafeTileResidencyStateV1,
} from './tensor-handle-4x4x6-v1.js';
import { createSingleVramLeaseCoordinatorV1 } from './vram-lease-coordinator-v1.js';

describe('MEM-04 single VRAM lease coordinator', () => {
  it('enforces exclusive runtime ownership, TTL expiry, and explicit release', () => {
    const coord = createSingleVramLeaseCoordinatorV1({ minFreeVramMiB: 1536 });

    const first = coord.acquireLease({
      runtimeId: 'llama-8090',
      requestedMiB: 2048,
      freeVramMiB: 4096,
      ttlMs: 1000,
      nowMs: 100,
    });
    expect(first.granted).toBe(true);
    expect(first.lease?.runtimeId).toBe('llama-8090');

    // Second runtime is blocked while lease is active
    const conflict = coord.acquireLease({
      runtimeId: 'tensorrt-rtx',
      requestedMiB: 1024,
      freeVramMiB: 4096,
      nowMs: 500,
    });
    expect(conflict.granted).toBe(false);
    expect(conflict.reason).toBe('VRAM_LEASE_CONFLICT:llama-8090');

    // After TTL expiry, second runtime can acquire
    const afterExpiry = coord.acquireLease({
      runtimeId: 'tensorrt-rtx',
      requestedMiB: 1024,
      freeVramMiB: 4096,
      nowMs: 1200,
    });
    expect(afterExpiry.granted).toBe(true);
    expect(coord.releaseLease(afterExpiry.lease!.leaseId)).toBe(true);
    expect(coord.getActiveLease(1250)).toBeNull();
  });

  it('evicts EVICTABLE tiles under VRAM pressure to satisfy the 1,536 MiB preflight', () => {
    const eviction = createVramPressureEvictionCoordinatorV1({ minFreeVramMiB: 1536 });
    const evictableTile = {
      tileId: 'tile:evict-me',
      residencyState: SafeTileResidencyStateV1.EVICTABLE,
      byteSize: 600 * 1024 * 1024, // 600 MiB
      activeConsumers: 0,
      revisionMatched: true,
      leaseExpiresAtMs: 999_999,
      evictedAtMs: null,
    };
    eviction.registerOrTouch(evictableTile);

    const coord = createSingleVramLeaseCoordinatorV1({
      minFreeVramMiB: 1536,
      evictionCoordinator: eviction,
    });

    // Free VRAM starts at 1024 MiB (< 1536 MiB), reclaiming 600 MiB brings it to 1624 MiB
    const res = coord.acquireLease({
      runtimeId: 'pytorch-cuda',
      requestedMiB: 1024,
      freeVramMiB: 1024,
      nowMs: 5000,
    });
    expect(res.granted).toBe(true);
    expect(res.eviction?.evictedTileIds).toEqual(['tile:evict-me']);
    expect(evictableTile.residencyState).toBe(SafeTileResidencyStateV1.EVICTED);
    expect(evictableTile.evictedAtMs).toBe(5000);
  });

  it('fails closed when free VRAM remains below 1,536 MiB after eviction', () => {
    const coord = createSingleVramLeaseCoordinatorV1({ minFreeVramMiB: 1536 });
    const res = coord.acquireLease({
      runtimeId: 'rapids-cuvs',
      requestedMiB: 1024,
      freeVramMiB: 512,
      nowMs: 6000,
    });
    expect(res.granted).toBe(false);
    expect(res.reason).toMatch(/^VRAM_FREE_BELOW_THRESHOLD/);
  });
});
