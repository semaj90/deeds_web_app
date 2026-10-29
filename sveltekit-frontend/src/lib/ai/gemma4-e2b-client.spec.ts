import { describe, expect, it } from 'vitest';
import { inspectE2BGpuAdmissionV1 } from './gemma4-gpu-admission-v1.js';

const base = {
  browser: true,
  webgpu: true,
  adapterPresent: true,
  requiredMemoryMB: 2048,
};

describe('Gemma 4 offline GPU admission (no model runtime)', () => {
  it('rejects SSR and browsers without WebGPU', () => {
    expect(inspectE2BGpuAdmissionV1({ ...base, browser: false }).reason).toBe('SSR');
    expect(inspectE2BGpuAdmissionV1({ ...base, webgpu: false }).reason).toBe('NO_WEBGPU');
  });
  it('never interprets adapter resource limits as free VRAM', () => {
    const decision = inspectE2BGpuAdmissionV1({ ...base, maxBufferSize: 8_000_000_000, maxStorageBufferBindingSize: 8_000_000_000 });
    expect(decision).toMatchObject({ eligible: false, availableMemoryMB: null, reason: 'GPU_MEMORY_UNVERIFIED' });
  });
  it('rejects verified but insufficient headroom', () => {
    expect(inspectE2BGpuAdmissionV1({
      ...base,
      independentlyVerifiedMemoryReceipt: true,
      operatorFreeMemoryMB: 512,
    })).toMatchObject({
      eligible: false, reason: 'GPU_MEMORY_INSUFFICIENT', availableMemoryMB: 512,
    });
  });
  it('requires verified local assets and explicit approval after memory admission', () => {
    const memoryVerified = {
      ...base,
      independentlyVerifiedMemoryReceipt: true,
      operatorFreeMemoryMB: 8192,
    };
    expect(inspectE2BGpuAdmissionV1(memoryVerified)).toMatchObject({
      eligible: false, reason: 'ASSETS_UNVERIFIED', availableMemoryMB: 8192,
    });
    expect(inspectE2BGpuAdmissionV1({ ...memoryVerified, offlineAssetManifestVerified: true })).toMatchObject({
      eligible: false, reason: 'USER_APPROVAL_REQUIRED', availableMemoryMB: 8192,
    });
    expect(inspectE2BGpuAdmissionV1({
      ...memoryVerified,
      offlineAssetManifestVerified: true,
      userApprovedLoad: true,
    })).toMatchObject({ eligible: true, reason: 'PREFLIGHT_READY', availableMemoryMB: 8192 });
  });
});
