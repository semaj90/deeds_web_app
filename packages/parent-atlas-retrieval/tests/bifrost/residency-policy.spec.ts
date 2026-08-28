import { describe, expect, it } from 'vitest';
import { BITFROST_RESIDENCY_POLICY_V1, decideResidencyV1 } from '../../src/bifrost/residency-policy';

describe('BitFrost residency policy v1', () => {
  it('uses revisioned HOT/WARM/COLD TTL ceilings', () => {
    expect(BITFROST_RESIDENCY_POLICY_V1.ttlSeconds).toEqual({ HOT: 2_592_000, WARM: 604_800, COLD: 86_400 });
    expect(BITFROST_RESIDENCY_POLICY_V1.canonicalAuthority).toBe(false);
  });

  it('promotes COLD to WARM only after utility and hit thresholds', () => {
    const decision = decideResidencyV1({ currentClass: 'COLD', utility: 0.4, hitCount: 2, inactiveSeconds: 0 });
    expect(decision).toMatchObject({ from: 'COLD', to: 'WARM', ttlOperation: 'EXPIRE_GT', reason: 'COLD_TO_WARM_UTILITY_AND_HITS' });
  });

  it('promotes WARM to HOT only after stronger thresholds', () => {
    const decision = decideResidencyV1({ currentClass: 'WARM', utility: 0.75, hitCount: 5, inactiveSeconds: 0 });
    expect(decision).toMatchObject({ from: 'WARM', to: 'HOT', ttlOperation: 'EXPIRE_GT' });
  });

  it('demotes on inactivity using a shorter TTL', () => {
    const decision = decideResidencyV1({ currentClass: 'HOT', utility: 0.9, hitCount: 10, inactiveSeconds: 14 * 24 * 60 * 60 });
    expect(decision).toMatchObject({ from: 'HOT', to: 'WARM', ttlOperation: 'EXPIRE_LT', reason: 'HOT_TO_WARM_INACTIVE' });
  });

  it('does not change residency for an ordinary stable observation', () => {
    const decision = decideResidencyV1({ currentClass: 'WARM', utility: 0.5, hitCount: 3, inactiveSeconds: 60 });
    expect(decision).toMatchObject({ from: 'WARM', to: 'WARM', changed: false, ttlOperation: 'NONE' });
  });

  it('rejects invalid utility and hit values', () => {
    expect(() => decideResidencyV1({ currentClass: 'COLD', utility: 1.1, hitCount: 0, inactiveSeconds: 0 })).toThrow('BITFROST_UTILITY_OUT_OF_RANGE');
    expect(() => decideResidencyV1({ currentClass: 'COLD', utility: 0, hitCount: -1, inactiveSeconds: 0 })).toThrow('BITFROST_HIT_COUNT_INVALID');
  });
});
