import { describe, expect, it } from 'vitest';
import { buildNativeInferenceBoundaryV1 } from './native-inference-boundary-v1.js';

describe('NativeInferenceBoundaryV1', () => {
  it('freezes the ABI-stable Node-API and LibTorch ownership boundary', () => {
    const boundary = buildNativeInferenceBoundaryV1({
      eventLoopPolicy: 'WORKER_THREAD',
      nodeApiVersion: 'N-API-9',
      nodeAddonApiRevision: 'node-addon-api:v8',
      libtorchVersion: 'libtorch:unbound',
      pytorchReferenceRevision: 'pytorch-reference:v1',
      cudaRuntimeRevision: null,
    });
    expect(boundary.abiBoundary).toBe('NODE_API');
    expect(boundary.directV8Internals).toBe(false);
    expect(boundary.tensorComputationOwner).toBe('LIBTORCH_ATEN');
    expect(boundary.transport).toBe('TYPED_BUFFERS_AND_RECEIPTS');
    expect(boundary.canonicalModelOwner).toBe(false);
  });

  it('requires an event-loop-safe execution policy', () => {
    expect(() => buildNativeInferenceBoundaryV1({
      eventLoopPolicy: 'BLOCKING_MAIN_THREAD' as never,
      nodeApiVersion: 'N-API-9',
      nodeAddonApiRevision: 'node-addon-api:v8',
      libtorchVersion: 'libtorch:unbound',
      pytorchReferenceRevision: 'pytorch-reference:v1',
      cudaRuntimeRevision: null,
    })).toThrow();
  });
});
