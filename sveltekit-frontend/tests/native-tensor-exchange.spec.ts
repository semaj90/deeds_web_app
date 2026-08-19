import { describe, expect, it } from 'vitest';
import {
  buildNativeTensorExchange,
  chooseNodeNativeTensorTransport,
  contiguousByteLength,
} from '../src/lib/server/atlas/runtime/native-tensor-exchange.js';

describe('native tensor exchange', () => {
  it('computes contiguous byte length from shape and dtype', () => {
    expect(contiguousByteLength([2, 768], 'fp32')).toBe(2 * 768 * 4);
    expect(contiguousByteLength([128, 4], 'fp16')).toBe(128 * 4 * 2);
  });

  it('treats a borrowed Node TypedArray as host memory and call scoped', () => {
    const exchange = buildNativeTensorExchange({
      producerRuntime: 'windows-native',
      consumerRuntime: 'windows-native',
      transportMode: 'NAPI_SYNC_HOST_VIEW',
      memoryDevice: 'CPU',
      dtype: 'fp32',
      shape: [32, 768],
      ownership: 'BORROWED_JS_ARRAYBUFFER',
      lifetime: 'CALL_SCOPED',
    });
    expect(exchange.byteLength).toBe(32 * 768 * 4);
    expect(exchange.memoryDevice).toBe('CPU');
  });

  it('rejects pretending a JavaScript TypedArray is CUDA memory', () => {
    expect(() => buildNativeTensorExchange({
      producerRuntime: 'windows-native', consumerRuntime: 'windows-native',
      transportMode: 'NAPI_SYNC_HOST_VIEW', memoryDevice: 'CUDA', dtype: 'fp32', shape: [1, 768],
      ownership: 'BORROWED_JS_ARRAYBUFFER', lifetime: 'CALL_SCOPED',
      environmentReceiptId: 'env', gpuLeaseId: 'lease',
    })).toThrow(/JS_TYPED_ARRAY_IS_HOST_MEMORY/);
  });

  it('requires an owned host copy for asynchronous N-API work', () => {
    expect(() => buildNativeTensorExchange({
      producerRuntime: 'windows-native', consumerRuntime: 'windows-native',
      transportMode: 'NAPI_ASYNC_OWNED_COPY', memoryDevice: 'CPU', dtype: 'fp32', shape: [16, 768],
      ownership: 'BORROWED_JS_ARRAYBUFFER', lifetime: 'CALL_SCOPED',
    })).toThrow(/ASYNC_NAPI_REQUIRES_OWNED_PROMISE_BUFFER/);
  });

  it('forbids DLPack capsules as Windows-to-WSL transport', () => {
    expect(() => buildNativeTensorExchange({
      producerRuntime: 'windows-native', consumerRuntime: 'wsl2',
      transportMode: 'DLPACK_DEVICE', memoryDevice: 'CUDA', dtype: 'fp32', shape: [8, 768],
      ownership: 'DLPACK_SHARED', lifetime: 'EXTERNAL_OWNER',
      synchronization: 'PRODUCER_CONSUMER_SYNC_REQUIRED',
      environmentReceiptId: 'env', gpuLeaseId: 'lease',
    })).toThrow(/DLPACK_CROSS_RUNTIME_FORBIDDEN/);
  });

  it('requires an immutable data reference for cross-runtime TensorRef', () => {
    const exchange = buildNativeTensorExchange({
      dataRefId: 'data:semantic:v109',
      producerRuntime: 'windows-native', consumerRuntime: 'wsl2',
      transportMode: 'PROTOBUF_TENSORREF', memoryDevice: 'CPU', dtype: 'fp32', shape: [1000, 768],
      ownership: 'IMMUTABLE_EXTERNAL_REF', lifetime: 'EXTERNAL_OWNER', immutable: true,
    });
    expect(exchange.dataRefId).toBe('data:semantic:v109');
  });

  it('rejects inconsistent contiguous byte lengths', () => {
    expect(() => buildNativeTensorExchange({
      producerRuntime: 'windows-native', consumerRuntime: 'windows-native',
      transportMode: 'NAPI_SYNC_HOST_VIEW', memoryDevice: 'CPU', dtype: 'fp32', shape: [2, 4], byteLength: 12,
      ownership: 'BORROWED_JS_ARRAYBUFFER', lifetime: 'CALL_SCOPED',
    })).toThrow(/BYTE_LENGTH_MISMATCH/);
  });

  it('uses references across runtimes and owned copies for async same-runtime calls', () => {
    expect(chooseNodeNativeTensorTransport({ asynchronous: true, crossRuntime: false, byteLength: 1024, immutable: false }))
      .toBe('NAPI_ASYNC_OWNED_COPY');
    expect(chooseNodeNativeTensorTransport({ asynchronous: false, crossRuntime: true, byteLength: 32 * 1024 * 1024, immutable: true }))
      .toBe('MMAP_REF');
  });
});
