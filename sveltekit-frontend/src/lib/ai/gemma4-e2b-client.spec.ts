import { describe, expect, it } from 'vitest';
import { evaluateE2BMemoryAdmission } from './gemma4-e2b-client.js';

describe('Gemma 4 offline GPU admission (no model runtime)', () => {
  it('rejects SSR and browsers without WebGPU', () => {
    expect(evaluateE2BMemoryAdmission({ browser: false, webgpu: true, minimumMB: 2048 }).reason).toBe('ssr');
    expect(evaluateE2BMemoryAdmission({ browser: true, webgpu: false, minimumMB: 2048 }).reason).toBe('no-webgpu');
  });
  it('never interprets adapter resource limits as free VRAM', () => {
    const decision = evaluateE2BMemoryAdmission({ browser: true, webgpu: true, minimumMB: 2048 });
    expect(decision).toMatchObject({ available: false, gpuMemoryMB: null, reason: 'gpu-memory-unverified' });
  });
  it('rejects verified but insufficient headroom', () => {
    expect(evaluateE2BMemoryAdmission({ browser: true, webgpu: true, minimumMB: 2048, verifiedFreeMB: 512 })).toMatchObject({
      available: false, reason: 'gpu-memory-low'
    });
  });
  it('does not permit model initialization with memory evidence alone', () => {
    expect(evaluateE2BMemoryAdmission({ browser: true, webgpu: true, minimumMB: 2048, verifiedFreeMB: 8192 })).toMatchObject({
      available: false, reason: 'model-admission-unverified'
    });
  });
});
