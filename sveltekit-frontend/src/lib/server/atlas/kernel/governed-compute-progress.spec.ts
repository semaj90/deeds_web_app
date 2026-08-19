import { describe, expect, it } from 'vitest';
import {
  GovernedComputeProgressSnapshotV1Schema,
  laneCompletionPercent,
  nextGovernedComputeGates,
  scoreGovernedComputeProgress,
} from './governed-compute-progress.js';

function gates(percent: 0 | 20 | 40 | 60 | 80 | 100) {
  return {
    contractDefined: percent >= 20,
    implementationPresent: percent >= 40,
    testsProven: percent >= 60,
    shadowProven: percent >= 80,
    productionHardened: percent >= 100,
  };
}

const laneIds = [
  'OWNERSHIP_AUTHORITY',
  'KERNEL_CONTRACTS',
  'SKILL_ADMISSION',
  'KERNEL_WORKER',
  'PYTHON_SKILLS',
  'DAG_TRANSPORTS',
  'ARTIFACT_RESIDENCY',
  'EXECUTOR_REGISTRY',
  'NATIVE_ABI_NODE_LOADER',
  'BACKEND_PARITY',
  'SECURITY_RECEIPTS',
  'PRODUCTION_ROLLOUT',
] as const;

describe('governed compute progress', () => {
  it('maps proof gates to exact 0-100 completion increments', () => {
    expect(laneCompletionPercent(gates(0))).toBe(0);
    expect(laneCompletionPercent(gates(20))).toBe(20);
    expect(laneCompletionPercent(gates(40))).toBe(40);
    expect(laneCompletionPercent(gates(60))).toBe(60);
    expect(laneCompletionPercent(gates(80))).toBe(80);
    expect(laneCompletionPercent(gates(100))).toBe(100);
  });

  it('rejects skipped proof gates', () => {
    expect(() => laneCompletionPercent({
      contractDefined: true,
      implementationPresent: false,
      testsProven: true,
      shadowProven: false,
      productionHardened: false,
    })).toThrow(/cannot be true before the previous proof gate/);
  });

  it('weights lanes to exactly 100 percent and blocks production readiness until every lane is hardened', () => {
    const snapshot = GovernedComputeProgressSnapshotV1Schema.parse({
      schema: 'atlas.governed-compute-progress.v1',
      changeId: 'parent-atlas-governed-compute-fabric',
      branch: 'feature/parent-atlas-spectral-multihop',
      observedAt: '2026-08-19T16:45:00.000Z',
      sourceRevision: 'fixture',
      lanes: laneIds.map((laneId, index) => ({
        laneId,
        openspecSections: [index],
        gates: gates(laneId === 'KERNEL_CONTRACTS' ? 60 : 20),
        evidenceRefs: [],
        blockers: [],
        notes: [],
      })),
      producerRevision: 'test',
    });

    const score = scoreGovernedComputeProgress(snapshot);
    expect(score.weightedCompletionPercent).toBeGreaterThan(20);
    expect(score.weightedCompletionPercent).toBeLessThan(60);
    expect(score.productionReady).toBe(false);
    expect(score.minimumLanePercent).toBe(20);
  });

  it('reports the next proof gate per lane', () => {
    const snapshot = GovernedComputeProgressSnapshotV1Schema.parse({
      schema: 'atlas.governed-compute-progress.v1',
      changeId: 'parent-atlas-governed-compute-fabric',
      branch: 'feature/parent-atlas-spectral-multihop',
      observedAt: '2026-08-19T16:45:00.000Z',
      sourceRevision: 'fixture',
      lanes: laneIds.map((laneId, index) => ({
        laneId,
        openspecSections: [index],
        gates: gates(laneId === 'KERNEL_CONTRACTS' ? 40 : 0),
        evidenceRefs: [],
        blockers: laneId === 'KERNEL_WORKER' ? ['worker not implemented'] : [],
        notes: [],
      })),
      producerRevision: 'test',
    });

    const next = nextGovernedComputeGates(snapshot);
    expect(next.find((entry) => entry.laneId === 'KERNEL_CONTRACTS')?.nextGate).toBe('TESTS_PROVEN');
    expect(next.find((entry) => entry.laneId === 'KERNEL_WORKER')?.nextGate).toBe('CONTRACT_DEFINED');
  });
});
