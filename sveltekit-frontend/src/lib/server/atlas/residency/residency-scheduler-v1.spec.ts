import { describe, expect, it } from 'vitest';
import type { ExecutionHeadroomV1, HeadroomUsageV1 } from '../orchestration/execution-headroom-v1.js';
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
    queryRelevance: 0.76,
    predictedNextUse: 0.84,
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
    queryRelevance: 0.72,
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
