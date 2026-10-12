import { describe, expect, it } from 'vitest';
import {
	canQueueComputeTask,
	computeGpuSimilarityChunkSize,
	computeDefaultComputePoolSize,
	DEFAULT_MAX_QUEUED_COMPUTE_BYTES,
	DEFAULT_MAX_QUEUED_COMPUTE_TASKS,
	computeSimilarityChunkSize,
	estimateComputePayloadBytes,
	MAX_SIMILARITY_CANDIDATES_PER_BATCH,
	MAX_GPU_SIMILARITY_VALUES_PER_BATCH,
} from './compute-pool.js';

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

describe('bounded compute-pool queue admission', () => {
	it('caps queued tasks at the configured limit', () => {
		expect(canQueueComputeTask(DEFAULT_MAX_QUEUED_COMPUTE_TASKS - 1, DEFAULT_MAX_QUEUED_COMPUTE_TASKS)).toBe(true);
		expect(canQueueComputeTask(DEFAULT_MAX_QUEUED_COMPUTE_TASKS, DEFAULT_MAX_QUEUED_COMPUTE_TASKS)).toBe(false);
	});

	it('rejects all waiting tasks when the queue limit is zero', () => {
		expect(canQueueComputeTask(0, 0)).toBe(false);
	});

	it('rejects invalid queue bounds', () => {
		expect(canQueueComputeTask(-1, 4)).toBe(false);
		expect(canQueueComputeTask(0, -1)).toBe(false);
		expect(canQueueComputeTask(1.5, 4)).toBe(false);
	});

	it('estimates UTF-8 strings and binary buffers within the queue byte budget', () => {
		expect(estimateComputePayloadBytes({ text: 'é' })).toBeGreaterThan(Buffer.byteLength('é', 'utf8'));
		expect(estimateComputePayloadBytes(new Uint8Array([1, 2, 3]))).toBe(19);
	});

	it('rejects payloads that exceed the queue byte budget or traversal bound', () => {
		expect(estimateComputePayloadBytes('x'.repeat(DEFAULT_MAX_QUEUED_COMPUTE_BYTES + 1))).toBe(Number.POSITIVE_INFINITY);
		expect(estimateComputePayloadBytes(Array(250_001).fill(0))).toBe(Number.POSITIVE_INFINITY);
	});

	it('accounts for cycles once rather than recursing indefinitely', () => {
		const value: Record<string, unknown> = {};
		value.self = value;
		expect(Number.isFinite(estimateComputePayloadBytes(value))).toBe(true);
	});
});

describe('bounded cosine-similarity batches', () => {
	it('preserves small batches and caps larger ones at 500 candidates', () => {
		expect(computeSimilarityChunkSize(120, 768)).toBe(120);
		expect(computeSimilarityChunkSize(MAX_SIMILARITY_CANDIDATES_PER_BATCH + 1, 768)).toBe(MAX_SIMILARITY_CANDIDATES_PER_BATCH);
	});

	it('reduces chunk size when one candidate row approaches the byte limit', () => {
		expect(computeSimilarityChunkSize(10_000, 32_768)).toBeLessThan(500);
	});

	it('bounds GPU nested-array expansion separately from typed-buffer bytes', () => {
		const chunkSize = computeGpuSimilarityChunkSize(10_000, 768);
		expect(chunkSize).toBeLessThan(computeSimilarityChunkSize(10_000, 768));
		expect((chunkSize + 1) * 768).toBeLessThanOrEqual(MAX_GPU_SIMILARITY_VALUES_PER_BATCH);
		expect(computeGpuSimilarityChunkSize(10_000, 32_768)).toBeLessThan(10);
	});

	it('rejects malformed shapes and allows an empty candidate set', () => {
		expect(computeSimilarityChunkSize(0, 768)).toBe(0);
		expect(() => computeSimilarityChunkSize(-1, 768)).toThrow('SIMILARITY_SHAPE_INVALID');
		expect(() => computeSimilarityChunkSize(1, 0)).toThrow('SIMILARITY_SHAPE_INVALID');
		expect(() => computeSimilarityChunkSize(Number.MAX_SAFE_INTEGER, 1)).not.toThrow();
	});
});
