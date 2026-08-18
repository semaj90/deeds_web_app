import { describe, expect, it } from 'vitest';
import { GpuLeaseArbiter } from '../src/lib/server/atlas/runtime/gpu-lease-arbiter.js';

describe('GpuLeaseArbiter', () => {
  it('counts Windows and WSL reservations against one physical VRAM envelope', () => {
    const arbiter = new GpuLeaseArbiter({
      deviceIdentity: { pciDeviceId: '10de:2489', computeCapability: '8.6' },
      totalBudgetBytes: 1_000,
      safetyReserveBytes: 100,
    });
    arbiter.acquire({ runtime: 'windows-native', executor: 'cublaslt', requestedBytes: 400, priority: 'INTERACTIVE', environmentReceiptId: 'env:windows', ttlMs: 60_000 }, 1_000);
    arbiter.acquire({ runtime: 'wsl2', executor: 'cugraph', requestedBytes: 300, priority: 'BACKGROUND', environmentReceiptId: 'env:wsl', ttlMs: 60_000 }, 1_000);
    expect(arbiter.reservedBytes(1_001)).toBe(700);
    expect(arbiter.availableBytes(1_001)).toBe(200);
  });

  it('fails closed when a second runtime would exceed the shared envelope', () => {
    const arbiter = new GpuLeaseArbiter({
      deviceIdentity: { pciDeviceId: '10de:2489', computeCapability: '8.6' },
      totalBudgetBytes: 1_000,
      safetyReserveBytes: 100,
    });
    arbiter.acquire({ runtime: 'windows-native', executor: 'tensorrt-rtx', requestedBytes: 700, priority: 'INTERACTIVE', environmentReceiptId: 'env:windows', ttlMs: 60_000 }, 1_000);
    expect(() => arbiter.acquire({ runtime: 'wsl2', executor: 'tensorrt-llm', requestedBytes: 300, priority: 'INTERACTIVE', environmentReceiptId: 'env:wsl', ttlMs: 60_000 }, 1_001)).toThrow(/GPU_LEASE_CAPACITY_EXCEEDED/);
  });

  it('reaps expired leases', () => {
    const arbiter = new GpuLeaseArbiter({
      deviceIdentity: { pciDeviceId: '10de:2489', computeCapability: '8.6' },
      totalBudgetBytes: 1_000,
      safetyReserveBytes: 100,
    });
    arbiter.acquire({ runtime: 'wsl2', executor: 'cagra', requestedBytes: 500, priority: 'BACKGROUND', environmentReceiptId: 'env:wsl', ttlMs: 10 }, 1_000);
    expect(arbiter.reservedBytes(1_011)).toBe(0);
  });
});
