import type { ExecutionHeadroomV1, HeadroomUsageV1 } from '../orchestration/execution-headroom-v1.js';
import { remainingHeadroomV1 } from '../orchestration/execution-headroom-v1.js';
import type { PacketLodV1, ResidencyStateV1 } from './packet-lod-v1.js';

export const RESIDENCY_SCHEDULER_V1_SCHEMA = 'parent-atlas.residency-scheduler.v1' as const;

export type ResidencyDecisionActionV1 =
  | 'KEEP'
  | 'PREFETCH'
  | 'PROMOTE'
  | 'DEMOTE'
  | 'DEFER';

export interface ResidencyCandidateV1 {
  resourceRef: string;
  canonicalId: string;
  lod: PacketLodV1;
  currentResidency: ResidencyStateV1;

  queryRelevance: number;
  predictedNextUse: number;
  expectedReuse: number;
  historicalUtility: number;

  fetchBytes: number;
  cpuBytes: number;
  gpuBytes: number;
  tokenCost: number;
  estimatedLatencyMs: number;

  requiredNow?: boolean;
}

export interface ResidencySchedulerPolicyV1 {
  policyRevision: string;
  hotPromoteThreshold: number;
  hotRetainThreshold: number;
  warmThreshold: number;
  deferThreshold: number;

  weights: {
    queryRelevance: number;
    predictedNextUse: number;
    expectedReuse: number;
    historicalUtility: number;
    costPenalty: number;
  };
}

export interface ResidencyDecisionV1 {
  resourceRef: string;
  canonicalId: string;
  lod: PacketLodV1;
  currentResidency: ResidencyStateV1;
  targetResidency: ResidencyStateV1;
  action: ResidencyDecisionActionV1;
  score: number;
  priority: number;
  reason:
    | 'REQUIRED_NOW'
    | 'HIGH_EXPECTED_UTILITY'
    | 'PREFETCH_WORTHWHILE'
    | 'RETAIN_HYSTERESIS'
    | 'LOW_MARGINAL_UTILITY'
    | 'HEADROOM_EXCEEDED';
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
}

function normalizedCost(
  c: ResidencyCandidateV1,
  headroom: ExecutionHeadroomV1
): number {
  const byteCost = c.fetchBytes / Math.max(1, headroom.maxFetchedBytes);
  const cpuCost = c.cpuBytes / Math.max(1, headroom.maxCpuBytes);
  const gpuCost = c.gpuBytes / Math.max(1, headroom.maxGpuBytes);
  const tokenCost = c.tokenCost / Math.max(1, headroom.maxContextTokens);
  const latencyCost = c.estimatedLatencyMs / Math.max(1, headroom.maxWallClockMs);
  return clamp01((byteCost + cpuCost + gpuCost + tokenCost + latencyCost) / 5);
}

export function residencyUtilityScoreV1(
  c: ResidencyCandidateV1,
  policy: ResidencySchedulerPolicyV1,
  headroom: ExecutionHeadroomV1
): number {
  const w = policy.weights;
  const value =
    w.queryRelevance * clamp01(c.queryRelevance) +
    w.predictedNextUse * clamp01(c.predictedNextUse) +
    w.expectedReuse * clamp01(c.expectedReuse) +
    w.historicalUtility * clamp01(c.historicalUtility) -
    w.costPenalty * normalizedCost(c, headroom);
  return clamp01(value);
}

function exceedsRemainingHeadroom(
  c: ResidencyCandidateV1,
  headroom: ExecutionHeadroomV1,
  used: HeadroomUsageV1
): boolean {
  const remaining = remainingHeadroomV1(headroom, used);
  return (
    c.fetchBytes > remaining.fetchedBytes ||
    c.cpuBytes > remaining.cpuBytes ||
    c.gpuBytes > remaining.gpuBytes ||
    c.tokenCost > remaining.contextTokens ||
    c.estimatedLatencyMs > remaining.wallClockMs
  );
}

export function scheduleResidencyV1(input: {
  candidates: readonly ResidencyCandidateV1[];
  policy: ResidencySchedulerPolicyV1;
  headroom: ExecutionHeadroomV1;
  used: HeadroomUsageV1;
}): readonly ResidencyDecisionV1[] {
  return input.candidates
    .map((candidate): ResidencyDecisionV1 => {
      const score = residencyUtilityScoreV1(candidate, input.policy, input.headroom);

      if (candidate.requiredNow) {
        if (exceedsRemainingHeadroom(candidate, input.headroom, input.used)) {
          return {
            resourceRef: candidate.resourceRef,
            canonicalId: candidate.canonicalId,
            lod: candidate.lod,
            currentResidency: candidate.currentResidency,
            targetResidency: candidate.currentResidency,
            action: 'DEFER',
            score,
            priority: 1,
            reason: 'HEADROOM_EXCEEDED'
          };
        }

        const targetResidency: ResidencyStateV1 =
          candidate.gpuBytes > 0 ? 'HOT_GPU' : 'HOT_CPU';
        return {
          resourceRef: candidate.resourceRef,
          canonicalId: candidate.canonicalId,
          lod: candidate.lod,
          currentResidency: candidate.currentResidency,
          targetResidency,
          action:
            candidate.currentResidency === targetResidency ? 'KEEP' : 'PROMOTE',
          score,
          priority: 1,
          reason: 'REQUIRED_NOW'
        };
      }

      if (exceedsRemainingHeadroom(candidate, input.headroom, input.used)) {
        return {
          resourceRef: candidate.resourceRef,
          canonicalId: candidate.canonicalId,
          lod: candidate.lod,
          currentResidency: candidate.currentResidency,
          targetResidency: 'COLD',
          action: candidate.currentResidency === 'COLD' ? 'KEEP' : 'DEMOTE',
          score,
          priority: score,
          reason: 'HEADROOM_EXCEEDED'
        };
      }

      const wasHot =
        candidate.currentResidency === 'HOT_CPU' || candidate.currentResidency === 'HOT_GPU';

      if (wasHot && score >= input.policy.hotRetainThreshold) {
        return {
          resourceRef: candidate.resourceRef,
          canonicalId: candidate.canonicalId,
          lod: candidate.lod,
          currentResidency: candidate.currentResidency,
          targetResidency: candidate.currentResidency,
          action: 'KEEP',
          score,
          priority: score,
          reason: 'RETAIN_HYSTERESIS'
        };
      }

      if (score >= input.policy.hotPromoteThreshold) {
        const targetResidency: ResidencyStateV1 =
          candidate.gpuBytes > 0 ? 'HOT_GPU' : 'HOT_CPU';
        return {
          resourceRef: candidate.resourceRef,
          canonicalId: candidate.canonicalId,
          lod: candidate.lod,
          currentResidency: candidate.currentResidency,
          targetResidency,
          action: candidate.currentResidency === targetResidency ? 'KEEP' : 'PROMOTE',
          score,
          priority: score,
          reason: 'HIGH_EXPECTED_UTILITY'
        };
      }

      if (score >= input.policy.warmThreshold) {
        return {
          resourceRef: candidate.resourceRef,
          canonicalId: candidate.canonicalId,
          lod: candidate.lod,
          currentResidency: candidate.currentResidency,
          targetResidency: 'WARM',
          action: candidate.currentResidency === 'WARM' ? 'KEEP' : 'PREFETCH',
          score,
          priority: score,
          reason: 'PREFETCH_WORTHWHILE'
        };
      }

      return {
        resourceRef: candidate.resourceRef,
        canonicalId: candidate.canonicalId,
        lod: candidate.lod,
        currentResidency: candidate.currentResidency,
        targetResidency: 'COLD',
        action: candidate.currentResidency === 'COLD' ? 'KEEP' : 'DEMOTE',
        score,
        priority: score,
        reason: 'LOW_MARGINAL_UTILITY'
      };
    })
    .sort((a, b) => b.priority - a.priority || a.resourceRef.localeCompare(b.resourceRef));
}
