import {
  createVramPressureEvictionCoordinatorV1,
  type VramPressureEvictionResultV1,
} from './tensor-handle-4x4x6-v1.js';

export type VramRuntimeId =
  | 'llama-8090'
  | 'tensorrt-rtx'
  | 'pytorch-cuda'
  | 'rapids-cuvs'
  | 'onnx-cuda';

export interface ActiveVramLeaseV1 {
  leaseId: string;
  runtimeId: VramRuntimeId;
  requestedMiB: number;
  acquiredAtMs: number;
  expiresAtMs: number;
  exclusive: boolean;
}

export interface AcquireVramLeaseResultV1 {
  granted: boolean;
  reason: string | null;
  lease: ActiveVramLeaseV1 | null;
  eviction: VramPressureEvictionResultV1 | null;
}

/**
 * MEM-04 Single VRAM Lease Coordinator across runtimes on the 8 GiB workstation GPU.
 * Enforces exclusive runtime ownership, 1,536 MiB free-VRAM preflight, TTL expiry,
 * and pre-grant EVICTABLE tile eviction via createVramPressureEvictionCoordinatorV1.
 */
export function createSingleVramLeaseCoordinatorV1(options: {
  totalVramMiB?: number;
  minFreeVramMiB?: number;
  evictionCoordinator?: ReturnType<typeof createVramPressureEvictionCoordinatorV1>;
} = {}) {
  const totalVramMiB = options.totalVramMiB ?? 8192;
  const minFreeVramMiB = options.minFreeVramMiB ?? 1536;
  const evictionCoordinator =
    options.evictionCoordinator ??
    createVramPressureEvictionCoordinatorV1({ minFreeVramMiB });

  let activeLease: ActiveVramLeaseV1 | null = null;
  let seq = 0;

  function expireIfNeeded(nowMs: number): void {
    if (activeLease && nowMs >= activeLease.expiresAtMs) {
      activeLease = null;
    }
  }

  return {
    getActiveLease(nowMs = Date.now()): ActiveVramLeaseV1 | null {
      expireIfNeeded(nowMs);
      return activeLease;
    },

    acquireLease(input: {
      runtimeId: VramRuntimeId;
      requestedMiB: number;
      freeVramMiB: number;
      ttlMs?: number;
      exclusive?: boolean;
      nowMs?: number;
    }): AcquireVramLeaseResultV1 {
      const nowMs = input.nowMs ?? Date.now();
      expireIfNeeded(nowMs);

      if (!Number.isFinite(input.requestedMiB) || input.requestedMiB <= 0 || input.requestedMiB > totalVramMiB) {
        return {
          granted: false,
          reason: 'VRAM_REQUEST_INVALID',
          lease: null,
          eviction: null,
        };
      }

      if (activeLease && (activeLease.exclusive || input.exclusive !== false)) {
        return {
          granted: false,
          reason: `VRAM_LEASE_CONFLICT:${activeLease.runtimeId}`,
          lease: null,
          eviction: null,
        };
      }

      let eviction: VramPressureEvictionResultV1 | null = null;
      let effectiveFreeMiB = input.freeVramMiB;

      if (effectiveFreeMiB < minFreeVramMiB || effectiveFreeMiB < input.requestedMiB) {
        const deficitBytes = Math.max(
          minFreeVramMiB - effectiveFreeMiB,
          input.requestedMiB - effectiveFreeMiB,
          0,
        ) * 1024 * 1024;
        eviction = evictionCoordinator.onVramPressure({
          freeVramMiB: effectiveFreeMiB,
          minFreeVramMiB,
          targetReclaimBytes: deficitBytes > 0 ? deficitBytes : undefined,
          nowMs,
        });
        effectiveFreeMiB += eviction.reclaimedBytes / (1024 * 1024);
      }

      if (effectiveFreeMiB < minFreeVramMiB) {
        return {
          granted: false,
          reason: `VRAM_FREE_BELOW_THRESHOLD:${Math.floor(effectiveFreeMiB)}<${minFreeVramMiB}`,
          lease: null,
          eviction,
        };
      }
      if (effectiveFreeMiB < input.requestedMiB) {
        return {
          granted: false,
          reason: `VRAM_INSUFFICIENT_FOR_REQUEST:${Math.floor(effectiveFreeMiB)}<${input.requestedMiB}`,
          lease: null,
          eviction,
        };
      }

      seq += 1;
      const ttlMs = Math.max(100, input.ttlMs ?? 30_000);
      const lease: ActiveVramLeaseV1 = {
        leaseId: `vram-lease:${input.runtimeId}:${seq}`,
        runtimeId: input.runtimeId,
        requestedMiB: input.requestedMiB,
        acquiredAtMs: nowMs,
        expiresAtMs: nowMs + ttlMs,
        exclusive: input.exclusive ?? true,
      };
      activeLease = lease;
      return {
        granted: true,
        reason: null,
        lease,
        eviction,
      };
    },

    releaseLease(leaseId: string): boolean {
      if (!activeLease || activeLease.leaseId !== leaseId) {
        return false;
      }
      activeLease = null;
      return true;
    },
  };
}
