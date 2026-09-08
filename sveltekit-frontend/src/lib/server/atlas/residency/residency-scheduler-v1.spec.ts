import { describe, expect, it } from 'vitest';
import type { ExecutionHeadroomV1, HeadroomUsageV1 } from '../orchestration/execution-headroom-v1.js';
import { compareUtf8 } from '../features/canonical-candidate-v1.js';
import type { PacketLodV1, ResidencyStateV1 } from './packet-lod-v1.js';
import {
  scheduleResidencyV1,
  type ResidencyCandidateV1,
  type ResidencySchedulerPolicyV1
} from './residency-scheduler-v1.js';

const headroom: ExecutionHeadroomV1 = {
  schema: 'parent-atlas.execution-headroom.v1',
  requestId: 'req-example',
  maxWallClockMs: 10_000,
  maxPostgresReads: 32,
  maxSourceReads: 8,
  maxFetchedBytes: 8_000_000,
  maxSemanticCandidates: 512,
  maxGraphExpansions: 64,
  maxCpuBytes: 256_000_000,
  maxGpuBytes: 512_000_000,
  maxContextTokens: 8_000,
  maxConcurrentEvidenceBranches: 3,
  maxCpuWorkers: 4,
  maxConcurrentGpuJobs: 1,
  reserveGpuBytes: 256_000_000,
  reserveContextTokens: 1_000
};

const used: HeadroomUsageV1 = {
  elapsedMs: 400,
  postgresReads: 2,
  sourceReads: 1,
  fetchedBytes: 50_000,
  semanticCandidates: 0,
  graphExpansions: 0,
  cpuBytes: 20_000_000,
  gpuBytes: 0,
  contextTokens: 250
};

const policy: ResidencySchedulerPolicyV1 = {
  policyRevision: 'residency-policy-r1',
  hotPromoteThreshold: 0.75,
  hotRetainThreshold: 0.45,
  warmThreshold: 0.45,
  deferThreshold: 0.20,
  weights: {
    queryRelevance: 0.35,
    predictedNextUse: 0.30,
    expectedReuse: 0.15,
    historicalUtility: 0.20,
    costPenalty: 0.25
  }
};

const candidates: ResidencyCandidateV1[] = [
  {
    resourceRef: 'source:selector',
    canonicalId: 'symbol:selector',
    lod: 4,
    currentResidency: 'HOT_CPU',
    requiredNow: true,
    queryRelevance: 0.99,
    predictedNextUse: 0.96,
    expectedReuse: 0.90,
    historicalUtility: 0.95,
    fetchBytes: 0,
    cpuBytes: 80_000,
    gpuBytes: 0,
    tokenCost: 450,
    estimatedLatencyMs: 1
  },
  {
    resourceRef: 'card:caller-metadata',
    canonicalId: 'group:callers',
    lod: 2,
    currentResidency: 'COLD',
    queryRelevance: 0.68,
    predictedNextUse: 0.78,
    expectedReuse: 0.72,
    historicalUtility: 0.82,
    fetchBytes: 15_000,
    cpuBytes: 15_000,
    gpuBytes: 0,
    tokenCost: 80,
    estimatedLatencyMs: 18
  },
  {
    resourceRef: 'card:cagra-capability',
    canonicalId: 'capability:cagra',
    lod: 2,
    currentResidency: 'COLD',
    queryRelevance: 0.70,
    predictedNextUse: 0.78,
    expectedReuse: 0.68,
    historicalUtility: 0.82,
    fetchBytes: 8_000,
    cpuBytes: 8_000,
    gpuBytes: 0,
    tokenCost: 60,
    estimatedLatencyMs: 10
  },
  {
    resourceRef: 'card:focused-test-names',
    canonicalId: 'tests:cagra-selector',
    lod: 1,
    currentResidency: 'COLD',
    queryRelevance: 0.62,
    predictedNextUse: 0.67,
    expectedReuse: 0.55,
    historicalUtility: 0.75,
    fetchBytes: 3_000,
    cpuBytes: 3_000,
    gpuBytes: 0,
    tokenCost: 30,
    estimatedLatencyMs: 6
  },
  {
    resourceRef: 'source:all-callers',
    canonicalId: 'group:caller-sources',
    lod: 5,
    currentResidency: 'COLD',
    queryRelevance: 0.45,
    predictedNextUse: 0.34,
    expectedReuse: 0.20,
    historicalUtility: 0.50,
    fetchBytes: 6_000_000,
    cpuBytes: 30_000_000,
    gpuBytes: 0,
    tokenCost: 6_000,
    estimatedLatencyMs: 600
  },
  {
    resourceRef: 'graph:two-hop-cagra',
    canonicalId: 'graph:cagra:2hop',
    lod: 3,
    currentResidency: 'COLD',
    queryRelevance: 0.36,
    predictedNextUse: 0.21,
    expectedReuse: 0.20,
    historicalUtility: 0.45,
    fetchBytes: 2_500_000,
    cpuBytes: 40_000_000,
    gpuBytes: 64_000_000,
    tokenCost: 2_500,
    estimatedLatencyMs: 450
  }
];

describe('ResidencySchedulerV1 texture-streaming policy', () => {
  it('keeps current evidence hot, prefetches likely cards, and leaves expensive future work cold', () => {
    const decisions = scheduleResidencyV1({ candidates, policy, headroom, used });
    const byRef = Object.fromEntries(decisions.map((x) => [x.resourceRef, x]));

    expect(byRef['source:selector'].targetResidency).toBe('HOT_CPU');
    expect(byRef['card:caller-metadata'].targetResidency).toBe('WARM');
    expect(byRef['card:cagra-capability'].targetResidency).toBe('WARM');
    expect(byRef['card:focused-test-names'].targetResidency).toBe('WARM');
    expect(byRef['source:all-callers'].targetResidency).toBe('COLD');
    expect(byRef['graph:two-hop-cagra'].targetResidency).toBe('COLD');
  });
});

describe('ResidencySchedulerV1 deterministic eviction ordering (T4)', () => {
  it('demotes a previously-hot candidate to COLD/WARM when its utility falls below threshold — this is the eviction transition', () => {
    const decisions = scheduleResidencyV1({ candidates, policy, headroom, used });
    const twoHop = decisions.find((d) => d.resourceRef === 'graph:two-hop-cagra')!;
    // was COLD already in the fixture; assert the actual state-transition contract instead:
    // a HOT candidate whose score drops below hotRetainThreshold must DEMOTE, never silently KEEP.
    const hotButNowLowUtility: ResidencyCandidateV1 = {
      resourceRef: 'card:stale-hot-entry',
      canonicalId: 'group:stale',
      lod: 2,
      currentResidency: 'HOT_CPU',
      queryRelevance: 0.1,
      predictedNextUse: 0.1,
      expectedReuse: 0.1,
      historicalUtility: 0.1,
      fetchBytes: 1_000,
      cpuBytes: 1_000,
      gpuBytes: 0,
      tokenCost: 10,
      estimatedLatencyMs: 2
    };
    const withStale = scheduleResidencyV1({
      candidates: [...candidates, hotButNowLowUtility],
      policy,
      headroom,
      used
    });
    const staleDecision = withStale.find((d) => d.resourceRef === 'card:stale-hot-entry')!;
    expect(staleDecision.action).toBe('DEMOTE');
    expect(staleDecision.currentResidency).toBe('HOT_CPU');
    expect(staleDecision.targetResidency).not.toBe('HOT_CPU');
    expect(twoHop.action).toBe('KEEP'); // already COLD, low utility — no-op, not an eviction
  });

  it('output order is invariant to input (arrival) order — same candidates, any permutation, same eviction ranking', () => {
    const baseline = scheduleResidencyV1({ candidates, policy, headroom, used }).map((d) => d.resourceRef);

    const permutations = [
      [...candidates].reverse(),
      [candidates[3], candidates[0], candidates[5], candidates[1], candidates[4], candidates[2]],
      [candidates[5], candidates[4], candidates[3], candidates[2], candidates[1], candidates[0]]
    ];

    for (const permutation of permutations) {
      const reordered = scheduleResidencyV1({ candidates: permutation, policy, headroom, used }).map((d) => d.resourceRef);
      expect(reordered).toEqual(baseline);
    }
  });

  it('ties in priority break on byte-order of resourceRef, not locale order (same non-determinism class as canonical-candidate-v1)', () => {
    // 'Ab' vs 'a_b' vs 'aa': locale-aware ICU collation and raw UTF-8 byte order
    // disagree here (documented already in canonical-candidate-v1.spec.ts's own
    // compareUtf8 proof) — assert the scheduler actually uses byte order.
    const tiedCandidateBase = {
      lod: 1 as PacketLodV1,
      currentResidency: 'COLD' as ResidencyStateV1,
      queryRelevance: 0.5,
      predictedNextUse: 0.5,
      expectedReuse: 0.5,
      historicalUtility: 0.5,
      fetchBytes: 100,
      cpuBytes: 100,
      gpuBytes: 0,
      tokenCost: 10,
      estimatedLatencyMs: 2
    };
    const tied: ResidencyCandidateV1[] = [
      { ...tiedCandidateBase, resourceRef: 'Ab', canonicalId: 'tie:Ab' },
      { ...tiedCandidateBase, resourceRef: 'a_b', canonicalId: 'tie:a_b' },
      { ...tiedCandidateBase, resourceRef: 'aa', canonicalId: 'tie:aa' }
    ];
    const decisions = scheduleResidencyV1({ candidates: tied, policy, headroom, used });
    // All three have identical scores (same inputs) so ordering is purely the tie-break.
    // Raw UTF-8 byte order: 'Ab' (0x41) < 'a_b' (0x61) < 'aa' (0x61, second byte 0x5f < 0x61... )
    // Verify against the exported compareUtf8 contract directly rather than hardcoding an
    // assumed order, so this test tracks the real tie-break function, not a guessed result.
    const expectedOrder = [...tied]
      .map((c) => c.resourceRef)
      .sort((a, b) => compareUtf8(a, b));
    expect(decisions.map((d) => d.resourceRef)).toEqual(expectedOrder);
    // And explicitly not locale order, proving this is not the bug this session already fixed twice elsewhere.
    const localeOrder = [...tied].map((c) => c.resourceRef).sort((a, b) => a.localeCompare(b));
    if (JSON.stringify(localeOrder) !== JSON.stringify(expectedOrder)) {
      expect(decisions.map((d) => d.resourceRef)).not.toEqual(localeOrder);
    }
  });
});
