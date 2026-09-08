import { describe, expect, it } from 'vitest';
import { computeDefaultComputePoolSize } from './compute-pool.js';

/**
 * Proves T7 (openspec/changes/parent-atlas-tensor-residency-integration/tasks.md):
 * "CPU worker staging bounded at four workers and measured." `ComputePool`
 * (this file) is the live, canonical worker-pool implementation -- 5 real
 * callers confirmed via repo-wide grep (langextract/native.ts,
 * ml/topic-cluster.ts, ml/som-cluster.ts, indexer/workers/index-worker-pool.ts
 * -- documented as "a typed facade over ComputePool" -- and analysis/
 * forensics.ts). A separate file, `atlas/tensors/cpu-worker-pool.ts`
 * (`CpuFeatureWorkerPool`), implements the same "bounded worker_threads pool"
 * capability again with zero callers and zero test coverage -- flagged as an
 * unresolved duplicate owner in this file's own tasks.md rather than invested
 * in further here, per this repo's Duplication Prevention rule.
 *
 * This test covers only the pool-SIZE bounding formula, extracted into
 * `computeDefaultComputePoolSize()` as a pure function so it is testable
 * without spawning real worker_threads (spawning 4 real OS threads per test
 * run would be slow and would require compute-worker.mjs to load cleanly in
 * the test environment -- out of scope for proving this specific bound).
 */
describe('computeDefaultComputePoolSize', () => {
  it('never exceeds 4 workers regardless of host CPU count', () => {
    expect(computeDefaultComputePoolSize(8, false)).toBe(4);
    expect(computeDefaultComputePoolSize(16, false)).toBe(4);
    expect(computeDefaultComputePoolSize(64, false)).toBe(4);
    expect(computeDefaultComputePoolSize(128, false)).toBe(4);
  });

  it('scales down on low-CPU-count hosts but never below 1', () => {
    expect(computeDefaultComputePoolSize(6, false)).toBe(4);
    expect(computeDefaultComputePoolSize(5, false)).toBe(3);
    expect(computeDefaultComputePoolSize(3, false)).toBe(1);
    expect(computeDefaultComputePoolSize(2, false)).toBe(1);
    expect(computeDefaultComputePoolSize(1, false)).toBe(1);
    expect(computeDefaultComputePoolSize(0, false)).toBe(1);
  });

  it('reduces to exactly 1 worker in cluster-worker mode regardless of CPU count', () => {
    expect(computeDefaultComputePoolSize(64, true)).toBe(1);
    expect(computeDefaultComputePoolSize(2, true)).toBe(1);
  });

  it('is a pure function: same input always produces the same output', () => {
    for (let i = 0; i < 10; i++) {
      expect(computeDefaultComputePoolSize(12, false)).toBe(4);
    }
  });
});
