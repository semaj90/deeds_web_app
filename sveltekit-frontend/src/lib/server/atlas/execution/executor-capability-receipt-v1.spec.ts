import { describe, expect, it } from 'vitest';
import {
  buildExecutorCapabilityReceiptV1,
  ExecutorCapabilityReceiptV1Schema,
} from './executor-capability-receipt-v1.js';

describe('ExecutorCapabilityReceiptV1', () => {
  it('covers every planned executor family without granting canonical authority', () => {
    const executors = [
      'pytorch_cpu', 'pytorch_cuda', 'libtorch_node_api', 'onnx_runtime',
      'webgpu', 'directml', 'cugraph', 'cutile', 'tensorrt_rtx',
    ] as const;

    for (const executor of executors) {
      const receipt = buildExecutorCapabilityReceiptV1({
        executor,
        executorRevision: `${executor}:v1`,
        device: executor === 'pytorch_cpu' ? 'cpu' : 'rtx-3060-ti',
        computeCapability: executor === 'pytorch_cpu' ? null : 'sm_86',
        driverRevision: executor === 'pytorch_cpu' ? null : 'unproven',
        runtimeRevision: 'compatibility-proof:v1',
        capabilityStatus: executor === 'pytorch_cpu' ? 'PROVEN' : 'UNPROVEN',
        parityStatus: executor === 'pytorch_cpu' ? 'REFERENCE' : 'NOT_RUN',
        canonicalAuthority: false,
        writesPerformed: false,
      });
      expect(ExecutorCapabilityReceiptV1Schema.parse(receipt)).toEqual(receipt);
      expect(receipt.canonicalAuthority).toBe(false);
      expect(receipt.writesPerformed).toBe(false);
    }
  });

  it('rejects receipts that try to promote an executor', () => {
    expect(() => ExecutorCapabilityReceiptV1Schema.parse({
      schema: 'atlas.executor-capability-receipt.v1',
      executor: 'tensorrt_rtx',
      executorRevision: 'tensorrt:v1',
      device: 'rtx-3060-ti',
      computeCapability: 'sm_86',
      driverRevision: 'driver:v1',
      runtimeRevision: 'trt-rtx:v1',
      capabilityStatus: 'PROVEN',
      parityStatus: 'PASSED',
      canonicalAuthority: true,
      writesPerformed: false,
      checksum: 'a'.repeat(64),
    })).toThrow();
  });
});
