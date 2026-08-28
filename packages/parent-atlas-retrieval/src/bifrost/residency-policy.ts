export type BitFrostResidencyClass = 'HOT' | 'WARM' | 'COLD';

export interface BitFrostResidencyPolicyV1 {
  schema: 'atlas.bitfrost-residency-policy.v1';
  policyRevision: string;
  ttlSeconds: Record<BitFrostResidencyClass, number>;
  promotion: {
    warmToHotUtility: number;
    coldToWarmUtility: number;
    warmToHotMinHits: number;
    coldToWarmMinHits: number;
  };
  demotion: {
    hotToWarmUtilityBelow: number;
    warmToColdUtilityBelow: number;
    inactiveSeconds: number;
  };
  canonicalAuthority: false;
}

export const BITFROST_RESIDENCY_POLICY_V1: BitFrostResidencyPolicyV1 = {
  schema: 'atlas.bitfrost-residency-policy.v1',
  policyRevision: 'bitfrost-residency-policy:v1',
  ttlSeconds: { HOT: 30 * 24 * 60 * 60, WARM: 7 * 24 * 60 * 60, COLD: 24 * 60 * 60 },
  promotion: {
    warmToHotUtility: 0.75,
    coldToWarmUtility: 0.4,
    warmToHotMinHits: 5,
    coldToWarmMinHits: 2,
  },
  demotion: {
    hotToWarmUtilityBelow: 0.25,
    warmToColdUtilityBelow: 0.1,
    inactiveSeconds: 14 * 24 * 60 * 60,
  },
  canonicalAuthority: false,
};

export interface ResidencyObservationV1 {
  currentClass: BitFrostResidencyClass;
  utility: number;
  hitCount: number;
  inactiveSeconds: number;
}

export interface ResidencyDecisionV1 {
  from: BitFrostResidencyClass;
  to: BitFrostResidencyClass;
  changed: boolean;
  ttlSeconds: number;
  ttlOperation: 'NONE' | 'EXPIRE_GT' | 'EXPIRE_LT';
  reason: string;
  policyRevision: string;
  canonicalAuthority: false;
}

function boundedUtility(value: number): number {
  if (!Number.isFinite(value)) throw new Error('BITFROST_UTILITY_NOT_FINITE');
  if (value < 0 || value > 1) throw new Error('BITFROST_UTILITY_OUT_OF_RANGE');
  return value;
}

export function decideResidencyV1(
  observation: ResidencyObservationV1,
  policy: BitFrostResidencyPolicyV1 = BITFROST_RESIDENCY_POLICY_V1,
): ResidencyDecisionV1 {
  const utility = boundedUtility(observation.utility);
  if (!Number.isInteger(observation.hitCount) || observation.hitCount < 0) throw new Error('BITFROST_HIT_COUNT_INVALID');
  if (!Number.isFinite(observation.inactiveSeconds) || observation.inactiveSeconds < 0) throw new Error('BITFROST_INACTIVITY_INVALID');

  let to = observation.currentClass;
  let reason = 'RESIDENCY_UNCHANGED';
  if (observation.currentClass === 'COLD' && utility >= policy.promotion.coldToWarmUtility && observation.hitCount >= policy.promotion.coldToWarmMinHits) {
    to = 'WARM';
    reason = 'COLD_TO_WARM_UTILITY_AND_HITS';
  } else if (observation.currentClass === 'WARM' && utility >= policy.promotion.warmToHotUtility && observation.hitCount >= policy.promotion.warmToHotMinHits) {
    to = 'HOT';
    reason = 'WARM_TO_HOT_UTILITY_AND_HITS';
  } else if (observation.inactiveSeconds >= policy.demotion.inactiveSeconds) {
    if (observation.currentClass === 'HOT') {
      to = 'WARM';
      reason = 'HOT_TO_WARM_INACTIVE';
    } else if (observation.currentClass === 'WARM') {
      to = 'COLD';
      reason = 'WARM_TO_COLD_INACTIVE';
    }
  } else if (observation.currentClass === 'HOT' && utility < policy.demotion.hotToWarmUtilityBelow) {
    to = 'WARM';
    reason = 'HOT_TO_WARM_LOW_UTILITY';
  } else if (observation.currentClass === 'WARM' && utility < policy.demotion.warmToColdUtilityBelow) {
    to = 'COLD';
    reason = 'WARM_TO_COLD_LOW_UTILITY';
  }

  const changed = to !== observation.currentClass;
  return {
    from: observation.currentClass,
    to,
    changed,
    ttlSeconds: policy.ttlSeconds[to],
    ttlOperation: !changed ? 'NONE' : policy.ttlSeconds[to] > policy.ttlSeconds[observation.currentClass] ? 'EXPIRE_GT' : 'EXPIRE_LT',
    reason,
    policyRevision: policy.policyRevision,
    canonicalAuthority: false,
  };
}
