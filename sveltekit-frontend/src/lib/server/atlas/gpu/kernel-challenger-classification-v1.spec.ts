import { describe, expect, it } from 'vitest';
import { classifyKernelChallengerV1 } from './kernel-challenger-classification-v1.js';

describe('KernelChallengerClassificationV1', () => {
  it.each(['cutile', 'simt'] as const)('classifies %s as a noncanonical challenger', (kernelFamily) => {
    const result = classifyKernelChallengerV1({
      kernelFamily,
      benchmarkStatus: 'EXECUTED_UNPROVEN',
      logicalLane: 'feature',
      role: 'CHALLENGER',
      canonicalIdentityOwner: false,
      canonicalRankingOwner: false,
      canonicalAuthority: false,
      writesPerformed: false,
    });
    expect(result.role).toBe('CHALLENGER');
    expect(result.canonicalIdentityOwner).toBe(false);
    expect(result.canonicalRankingOwner).toBe(false);
    expect(result.writesPerformed).toBe(false);
  });

  it('rejects a promotion-shaped classification', () => {
    expect(() => classifyKernelChallengerV1({
      kernelFamily: 'cutile',
      benchmarkStatus: 'PARITY_PROVEN',
      logicalLane: 'semantic',
      role: 'CHALLENGER',
      canonicalIdentityOwner: true,
      canonicalRankingOwner: false,
      canonicalAuthority: false,
      writesPerformed: false,
    })).toThrow();
  });
});
