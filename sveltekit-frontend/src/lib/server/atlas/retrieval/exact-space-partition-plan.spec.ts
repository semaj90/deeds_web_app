import { describe, expect, it } from 'vitest';
import {
  exactTreeTournamentScope,
  physicalQuaternionAngularDistance,
  planExactSpacePartition,
  quaternionAntipodalEuclideanDistanceSquared,
} from './exact-space-partition-plan.js';

function base(overrides: Record<string, unknown> = {}) {
  return {
    schema: 'atlas.exact-space-partition-input.v1' as const,
    representation: 'PCA_LOW_RANK' as const,
    dimensions: 8,
    intrinsicDimensionsEstimate: null,
    sampleCount: 100_000,
    queryBatchSize: 1,
    metric: 'EUCLIDEAN' as const,
    leafSize: 30,
    vectorsNormalized: false,
    gpuAvailable: true,
    mutationSensitive: false,
    representationRevision: 'rep-1',
    producerRevision: 'test',
    ...overrides,
  };
}

describe('exact low-dimensional space-partition planner', () => {
  it('tournaments KD/cKD tree for low-dimensional Euclidean data', () => {
    const plan = planExactSpacePartition(base({ dimensions: 6 }));
    expect(['SCIPY_CKDTREE', 'SKLEARN_KD_TREE']).toContain(plan.preferredAlgorithm);
    expect(plan.highDimensionalTreeWarning).toBe(false);
    expect(plan.logicalLaneVoteAdded).toBe(false);
    expect(plan.exactPromotionPreserved).toBe(true);
  });

  it('includes BallTree as an exact moderate-dimensional challenger', () => {
    const plan = planExactSpacePartition(base({ dimensions: 12 }));
    const ball = plan.candidates.find((candidate) => candidate.algorithm === 'SKLEARN_BALL_TREE');
    expect(ball?.eligible).toBe(true);
    expect(ball?.recommended).toBe(true);
    expect(ball?.pruningGeometry).toBe('NESTED_METRIC_BALLS');
  });

  it('prefers brute force instead of tree authority for semantic768', () => {
    const plan = planExactSpacePartition(base({
      representation: 'SEMANTIC768',
      dimensions: 768,
      intrinsicDimensionsEstimate: null,
      metric: 'EUCLIDEAN',
    }));
    expect(plan.preferredAlgorithm).toBe('BRUTE_FORCE');
    expect(plan.highDimensionalTreeWarning).toBe(true);
  });

  it('prefers brute force for tiny datasets where tree overhead dominates', () => {
    const plan = planExactSpacePartition(base({ sampleCount: 20, dimensions: 4 }));
    expect(plan.preferredAlgorithm).toBe('BRUTE_FORCE');
  });

  it('uses BallTree rather than KDTree for haversine geometry', () => {
    const plan = planExactSpacePartition(base({ dimensions: 2, metric: 'HAVERSINE' }));
    const kd = plan.candidates.find((candidate) => candidate.algorithm === 'SKLEARN_KD_TREE');
    const ball = plan.candidates.find((candidate) => candidate.algorithm === 'SKLEARN_BALL_TREE');
    expect(kd?.eligible).toBe(false);
    expect(ball?.eligible).toBe(true);
  });

  it('supports physical quaternion search through the antipodal Euclidean identity', () => {
    const plan = planExactSpacePartition(base({
      representation: 'PHYSICAL_QUATERNION4',
      dimensions: 4,
      metric: 'QUATERNION_ANGULAR',
    }));
    const kd = plan.candidates.find((candidate) => candidate.algorithm === 'SKLEARN_KD_TREE');
    expect(kd?.eligible).toBe(true);
    expect(kd?.exactForDeclaredMetric).toBe(true);
    expect(kd?.requiresPostVerify).toBe(true);
  });

  it('makes q and -q physically identical', () => {
    const q = [1, 0, 0, 0] as const;
    const minusQ = [-1, 0, 0, 0] as const;
    expect(physicalQuaternionAngularDistance(q, minusQ)).toBeCloseTo(0, 12);
    expect(quaternionAntipodalEuclideanDistanceSquared(q, minusQ)).toBeCloseTo(0, 12);
  });

  it('preserves ordering between antipodal Euclidean chord distance and angular distance', () => {
    const q = [1, 0, 0, 0] as const;
    const near = [Math.cos(0.1), Math.sin(0.1), 0, 0] as const;
    const far = [Math.cos(0.7), Math.sin(0.7), 0, 0] as const;
    expect(quaternionAntipodalEuclideanDistanceSquared(q, near)).toBeLessThan(quaternionAntipodalEuclideanDistanceSquared(q, far));
    expect(physicalQuaternionAngularDistance(q, near)).toBeLessThan(physicalQuaternionAngularDistance(q, far));
  });

  it('exports brute force as reference and tree structures only as challengers', () => {
    const scope = exactTreeTournamentScope(planExactSpacePartition(base({ dimensions: 6 })));
    expect(scope.find((row) => row.algorithm === 'BRUTE_FORCE')?.role).toBe('REFERENCE');
    expect(scope.filter((row) => row.algorithm !== 'BRUTE_FORCE').every((row) => row.role === 'CHALLENGER')).toBe(true);
  });
});
