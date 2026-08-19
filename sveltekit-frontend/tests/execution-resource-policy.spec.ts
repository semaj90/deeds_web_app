import { describe, expect, it } from 'vitest';
import { planExecutionResources } from '../src/lib/server/atlas/runtime/execution-resource-policy.js';

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;

const base = {
  runtime: 'wsl2' as const,
  gpuTotalBytes: 8 * GiB,
  gpuFreeBytes: 3 * GiB,
  gpuReservedBytes: 256 * MiB,
  hostFreeBytes: 16 * GiB,
  nvmeFreeBytes: 200 * GiB,
  logicalCpuCount: 12,
  activeCpuWorkers: 2,
  activeIoWorkers: 1,
  activeRpcCalls: 2,
};

describe('planExecutionResources', () => {
  it('uses mmap/reference transport for large immutable cross-runtime matrices', () => {
    const plan = planExecutionResources({
      operation: 'CAGRA_SEARCH',
      executor: 'cagra',
      inputBytes: 128 * MiB,
      outputBytes: 1 * MiB,
      requiresGpu: false,
      crossRuntime: true,
      immutableLargeInput: true,
      producerRevision: 'test',
    }, base);
    expect(plan.inputMode).toBe('REFERENCE');
    expect(['MMAP_REF', 'ARROW_IPC']).toContain(plan.transport);
  });

  it('requires environment and lease proof for GPU work', () => {
    expect(() => planExecutionResources({
      operation: 'COSINE_TOPK',
      executor: 'cuvs-exact',
      inputBytes: 16 * MiB,
      outputBytes: 1 * MiB,
      requiresGpu: true,
      crossRuntime: false,
      producerRevision: 'test',
    }, base)).toThrow(/environmentReceiptId and gpuLeaseId/);
  });

  it('fails when a requested GPU working set crosses the safety reserve', () => {
    expect(() => planExecutionResources({
      operation: 'CAGRA_BUILD',
      executor: 'cagra',
      inputBytes: 4 * GiB,
      outputBytes: 1 * MiB,
      requiresGpu: true,
      crossRuntime: false,
      environmentReceiptId: 'env',
      gpuLeaseId: 'lease',
      producerRevision: 'test',
    }, base)).toThrow(/GPU_VRAM_BUDGET_EXCEEDED/);
  });
});
