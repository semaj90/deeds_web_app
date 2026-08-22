import { describe, expect, it } from 'vitest';

import { GpuRuntimeReceiptV1Schema, expectedSmArchitecture } from './gpu-runtime-abi-v1.js';

function base() {
  return {
    schema: 'atlas.gpu-runtime-receipt.v1' as const,
    abiVersion: 1 as const,
    abiMode: 'FRAMEWORK_FREE_C_ABI' as const,
    backend: 'CUTILE_AOT' as const,
    gpuName: 'NVIDIA GeForce RTX 3060 Ti',
    computeCapabilityMajor: 8,
    computeCapabilityMinor: 6,
    driverVersion: '580.88',
    systemToolkitVersion: '13.0',
    compilerToolkitVersion: '13.3',
    framework: null,
    frameworkVersion: null,
    frameworkCudaRuntimeVersion: null,
    backendLibraryVersion: 'cuda-tile:1.5',
    cxx11Abi: null,
    nodeApiBoundary: true,
    torchTypesCrossAbiBoundary: false,
    rapidsCppTypesCrossAbiBoundary: false,
    pythonObjectsCrossAbiBoundary: false,
    devicePointerTransport: 'RAW_DEVICE_POINTER_INTERNAL_ONLY' as const,
    streamHandleTransport: 'OPAQUE_HANDLE_ONLY' as const,
    producerRevision: 'gpu-runtime-abi-v1:test',
    observedAt: '2026-08-22T20:00:00.000Z',
  };
}

describe('GpuRuntimeReceiptV1', () => {
  it('accepts a framework-free cuTile AOT runtime receipt', () => {
    const receipt = GpuRuntimeReceiptV1Schema.parse(base());
    expect(expectedSmArchitecture(receipt)).toBe('sm_86');
  });

  it('rejects torch C++ objects crossing the common ABI', () => {
    expect(() => GpuRuntimeReceiptV1Schema.parse({ ...base(), torchTypesCrossAbiBoundary: true }))
      .toThrow('framework-owned C++/Python types may not cross');
  });

  it('requires exact framework identity for direct LibTorch linkage', () => {
    expect(() => GpuRuntimeReceiptV1Schema.parse({
      ...base(),
      abiMode: 'DIRECT_LIBTORCH_MATCHED_BUILD',
      backend: 'LIBTORCH',
      framework: 'libtorch',
      frameworkVersion: null,
      frameworkCudaRuntimeVersion: '12.8',
      cxx11Abi: true,
    })).toThrow('exact linked framework version');
  });

  it('rejects stable-LibTorch mode below 2.9', () => {
    expect(() => GpuRuntimeReceiptV1Schema.parse({
      ...base(),
      abiMode: 'LIBTORCH_STABLE_ABI',
      backend: 'LIBTORCH',
      framework: 'libtorch',
      frameworkVersion: '2.8.0',
      frameworkCudaRuntimeVersion: '12.8',
      cxx11Abi: true,
    })).toThrow('requires PyTorch/LibTorch 2.9+');
  });

  it('accepts stable-LibTorch mode at 2.9+', () => {
    const receipt = GpuRuntimeReceiptV1Schema.parse({
      ...base(),
      abiMode: 'LIBTORCH_STABLE_ABI',
      backend: 'LIBTORCH',
      framework: 'libtorch',
      frameworkVersion: '2.9.0',
      frameworkCudaRuntimeVersion: '13.0',
      cxx11Abi: true,
    });
    expect(receipt.abiMode).toBe('LIBTORCH_STABLE_ABI');
  });
});
