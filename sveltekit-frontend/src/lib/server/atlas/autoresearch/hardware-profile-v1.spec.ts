import { describe, expect, it } from 'vitest';
import {
  buildHardwareProfileV1,
  buildDevWorkstationAmpereProfileV1,
  hardwareProfileV1Schema,
  type CompilerProvider,
  type GpuFamily,
  type SupportedDtype,
} from './hardware-profile-v1.js';

function baseInput() {
  return {
    profileId: 'test-profile-1',
    gpuFamily: 'AMPERE' as GpuFamily,
    gpuName: 'NVIDIA GeForce RTX 3060 Ti',
    computeCapability: '8.6',
    driverRevision: '580.88',
    cudaToolkitRevision: '13.2',
    smCount: 38,
    warpSize: 32 as const,
    globalMemoryBytes: 8 * 1024 * 1024 * 1024,
    memoryBandwidthGbps: 448,
    sharedMemoryPerBlockBytes: 101376,
    registersPerBlock: 65536,
    tensorCoreCapabilities: ['fp16', 'bf16', 'tf32', 'int8'] as SupportedDtype[],
    supportedDtypes: ['fp32', 'fp16', 'bf16', 'tf32', 'int8'] as SupportedDtype[],
    compilerProviders: ['nvcc', 'cutile', 'triton', 'torch_inductor'] as CompilerProvider[],
    capturedAt: '2026-08-31T14:00:00.000Z',
    captureMethod: 'test fixture',
    producerRevision: 'test.v1',
  };
}

describe('AUTORESEARCH-02: HardwareProfileV1', () => {
  it('builds a valid profile with a self-consistent checksum', () => {
    const profile = buildHardwareProfileV1(baseInput());
    expect(hardwareProfileV1Schema.parse(profile)).toEqual(profile);
    expect(profile.identityAuthority).toBe(false);
  });

  it('is deterministic: identical input yields identical checksum', () => {
    const a = buildHardwareProfileV1(baseInput());
    const b = buildHardwareProfileV1(baseInput());
    expect(a.profileChecksum).toBe(b.profileChecksum);
  });

  it('changes checksum when any field changes', () => {
    const a = buildHardwareProfileV1(baseInput());
    const b = buildHardwareProfileV1({ ...baseInput(), smCount: 39 });
    expect(a.profileChecksum).not.toBe(b.profileChecksum);
  });

  it('rejects a tampered checksum on parse', () => {
    const profile = buildHardwareProfileV1(baseInput());
    const tampered = { ...profile, profileChecksum: 'f'.repeat(64) };
    expect(() => hardwareProfileV1Schema.parse(tampered)).toThrow();
  });

  it('rejects duplicate entries in supportedDtypes', () => {
    expect(() =>
      buildHardwareProfileV1({ ...baseInput(), supportedDtypes: ['fp32', 'fp32'] as const })
    ).toThrow();
  });

  it('rejects a tensorCoreCapabilities entry not present in supportedDtypes', () => {
    expect(() =>
      buildHardwareProfileV1({
        ...baseInput(),
        supportedDtypes: ['fp32'] as const,
        tensorCoreCapabilities: ['bf16'] as const,
      })
    ).toThrow();
  });

  it('rejects duplicate compilerProviders', () => {
    expect(() =>
      buildHardwareProfileV1({ ...baseInput(), compilerProviders: ['nvcc', 'nvcc'] as const })
    ).toThrow();
  });

  it('the real dev-workstation Ampere profile is valid and self-consistent', () => {
    const profile = buildDevWorkstationAmpereProfileV1();
    expect(hardwareProfileV1Schema.parse(profile)).toEqual(profile);
    expect(profile.gpuFamily).toBe('AMPERE');
    expect(profile.computeCapability).toBe('8.6');
    expect(profile.cudaToolkitRevision).toBe('13.2');
  });
});
