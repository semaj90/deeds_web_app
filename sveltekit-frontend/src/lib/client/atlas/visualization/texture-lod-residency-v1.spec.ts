import { describe, expect, it } from 'vitest';
import { decideTextureLodSwap } from './texture-lod-residency-v1.js';

describe('texture LOD residency v1', () => {
  const base = { currentLod: 2, availableLodCount: 4, requiredBytes: 1024, usedBytes: 2048, budgetBytes: 4096 };

  it('accepts a bounded replacement level', () => {
    expect(decideTextureLodSwap({ ...base, targetLod: 1 })).toEqual({
      accepted: true,
      targetLod: 1,
      requiredBytes: 1024,
      remainingBytes: 2048,
    });
  });

  it('rejects invalid, duplicate, and over-budget requests', () => {
    expect(decideTextureLodSwap({ ...base, targetLod: 4 })).toEqual({ accepted: false, reason: 'INVALID_TARGET' });
    expect(decideTextureLodSwap({ ...base, targetLod: 2 })).toEqual({ accepted: false, reason: 'ALREADY_RESIDENT' });
    expect(decideTextureLodSwap({ ...base, targetLod: 1, requiredBytes: 4097 })).toEqual({ accepted: false, reason: 'BUDGET_EXCEEDED' });
  });
});
