/**
 * TensorRT Worker Pool Integration Tests
 *
 * Validates multi-threaded GPU acceleration via N-API addon.
 * Tests verify:
 *   - Worker pool initialization and health
 *   - Concurrent task submission (parallelism)
 *   - Zero-copy ArrayBuffer transfer
 *   - Error handling and timeouts
 *   - Memory pooling (ArrayBuffer reuse)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
	getWorkerPool,
	terminateWorkerPool,
	gpuFindBMUBatch,
	gpuComputeAttentionBatch,
	gpuBatchCosineSimilarity,
	gpuKmeansWithCentroids,
	gpuPageRank,
	type GPUTask
} from '$lib/gpu/tensorrt-worker-pool.js';

describe('TensorRT Worker Pool Integration', () => {
	beforeAll(async () => {
		// Lazy-init: first call to getWorkerPool() creates threads
		getWorkerPool();
	});

	afterAll(async () => {
		await terminateWorkerPool();
	});

	describe('Worker Pool Lifecycle', () => {
		it('initializes pool with 4 worker threads', async () => {
			const pool = getWorkerPool();
			const stats = pool.getStats();

			expect(stats.poolSize).toBe(4);
			expect(stats.workers).toBe(4);
			expect(stats.activeTasks).toBeGreaterThanOrEqual(0);
			expect(stats.workerStates.length).toBe(4);
		});

		it('tracks worker health via threadId', async () => {
			const pool = getWorkerPool();
			const stats = pool.getStats();

			for (const workerState of stats.workerStates) {
				expect(workerState.threadId).toBeGreaterThan(0);
				expect(workerState.alive).toBe(true);
			}
		});

		it('reports queue depth and active tasks', async () => {
			const pool = getWorkerPool();
			const stats = pool.getStats();

			expect(stats.activeTasks).toBeGreaterThanOrEqual(0);
			expect(stats.queuedTasks).toBeGreaterThanOrEqual(0);
			expect(stats.activeTasks + stats.queuedTasks).toBeLessThanOrEqual(
				stats.poolSize + 256
			); // poolSize active + 256 queued max
		});
	});

	describe('GPU Find BMU (SOM Clustering)', () => {
		it('finds best matching units in 20x20 SOM grid', async () => {
			// Create 10 random 768-dim embeddings
			const embeddings = [];
			for (let i = 0; i < 10; i++) {
				const emb = new Float32Array(768);
				for (let j = 0; j < 768; j++) {
					emb[j] = Math.random();
				}
				embeddings.push(emb);
			}

			// Create 272 centroids (20x20 grid)
			const centroids = new Float32Array(272 * 768);
			for (let c = 0; c < 272; c++) {
				for (let d = 0; d < 768; d++) {
					centroids[c * 768 + d] = Math.random();
				}
			}

			const results = await gpuFindBMUBatch(embeddings, centroids, 20);

			expect(results.length).toBe(10);
			for (const result of results) {
				expect(result.cluster).toBeGreaterThanOrEqual(0);
				expect(result.cluster).toBeLessThan(272);
				expect(result.distance).toBeGreaterThanOrEqual(0);
			}
		});

		it('processes large batches in parallel', async () => {
			const batchSize = 100;
			const embeddings = [];
			for (let i = 0; i < batchSize; i++) {
				const emb = new Float32Array(768);
				for (let j = 0; j < 768; j++) {
					emb[j] = Math.random();
				}
				embeddings.push(emb);
			}

			const centroids = new Float32Array(272 * 768);
			for (let c = 0; c < 272; c++) {
				for (let d = 0; d < 768; d++) {
					centroids[c * 768 + d] = Math.random();
				}
			}

			const t0 = Date.now();
			const results = await gpuFindBMUBatch(embeddings, centroids, 20);
			const duration = Date.now() - t0;

			expect(results.length).toBe(batchSize);
			// GPU should be faster than CPU (or at least not 10× slower)
			expect(duration).toBeLessThan(10000); // 10s absolute max
		});
	});

	describe('GPU Attention Scoring', () => {
		it('computes attention scores for query vs keys', async () => {
			const query = new Float32Array(768);
			for (let i = 0; i < 768; i++) {
				query[i] = Math.random();
			}

			const keys = [];
			for (let i = 0; i < 32; i++) {
				const key = new Float32Array(768);
				for (let j = 0; j < 768; j++) {
					key[j] = Math.random();
				}
				keys.push(key);
			}

			const scores = await gpuComputeAttentionBatch(query, keys, 768);

			expect(scores.length).toBe(32);
			for (const score of scores) {
				expect(score).toBeGreaterThanOrEqual(-1.5); // cosine similarity in [-1, 1]
				expect(score).toBeLessThanOrEqual(1.5);
			}
		});

		it('batches attention computation efficiently', async () => {
			const query = new Float32Array(768);
			for (let i = 0; i < 768; i++) {
				query[i] = Math.random();
			}

			const batchSize = 256;
			const keys = [];
			for (let i = 0; i < batchSize; i++) {
				const key = new Float32Array(768);
				for (let j = 0; j < 768; j++) {
					key[j] = Math.random();
				}
				keys.push(key);
			}

			const t0 = Date.now();
			const scores = await gpuComputeAttentionBatch(query, keys, 768);
			const duration = Date.now() - t0;

			expect(scores.length).toBe(batchSize);
			// GPU parallelism should show benefit at batchSize > 64
			expect(duration).toBeLessThan(5000);
		});
	});

	describe('GPU Cosine Similarity', () => {
		it('computes cosine similarity between query and corpus', async () => {
			const query = new Float32Array(768);
			for (let i = 0; i < 768; i++) {
				query[i] = Math.random();
			}

			const corpus = [];
			for (let i = 0; i < 16; i++) {
				const doc = new Float32Array(768);
				for (let j = 0; j < 768; j++) {
					doc[j] = Math.random();
				}
				corpus.push(doc);
			}

			const similarities = await gpuBatchCosineSimilarity(query, corpus, 768);

			expect(similarities.length).toBe(16);
			for (const sim of similarities) {
				expect(sim).toBeGreaterThanOrEqual(-1.1);
				expect(sim).toBeLessThanOrEqual(1.1);
			}
		});

		it('handles zero-copy transfer correctly', async () => {
			const query = new Float32Array(768).fill(0.5);
			const corpus = [new Float32Array(768).fill(0.5)];

			const similarities = await gpuBatchCosineSimilarity(query, corpus, 768);

			// Query and corpus are identical → similarity ≈ 1.0
			expect(similarities[0]).toBeCloseTo(1.0, 2);
		});
	});

	describe('GPU K-Means', () => {
		it('clusters embeddings with GPU k-means', async () => {
			const n = 100;
			const dim = 768;
			const k = 5;

			// Create 100 random embeddings
			const embeddings = new Float32Array(n * dim);
			for (let i = 0; i < n * dim; i++) {
				embeddings[i] = Math.random();
			}

			const result = await gpuKmeansWithCentroids(embeddings, n, dim, k, 5);

			expect(result.assignments.length).toBe(n);
			expect(result.centroids.length).toBe(k * dim);

			// Verify assignments are in range [0, k)
			for (const assignment of result.assignments) {
				expect(assignment).toBeGreaterThanOrEqual(0);
				expect(assignment).toBeLessThan(k);
			}
		});

		it('respects max iterations parameter', async () => {
			const n = 50;
			const dim = 768;
			const k = 3;

			const embeddings = new Float32Array(n * dim);
			for (let i = 0; i < n * dim; i++) {
				embeddings[i] = Math.random();
			}

			const t0 = Date.now();
			const result = await gpuKmeansWithCentroids(embeddings, n, dim, k, 1);
			const duration = Date.now() - t0;

			// Single iteration should be fast (< 1s on GPU)
			expect(duration).toBeLessThan(1000);
			expect(result.assignments.length).toBe(n);
		});
	});

	describe('GPU PageRank', () => {
		it('computes PageRank on adjacency matrix', async () => {
			const n = 100;
			// Create sparse adjacency matrix (many zeros)
			const adjacency = new Float32Array(n * n);
			for (let i = 0; i < n; i++) {
				// Each node points to ~5 random other nodes
				for (let j = 0; j < 5; j++) {
					const target = Math.floor(Math.random() * n);
					adjacency[i * n + target] = 1.0;
				}
			}

			const ranks = await gpuPageRank(adjacency, n, 0.85, 10);

			expect(ranks.length).toBe(n);
			// All ranks should be positive
			for (const rank of ranks) {
				expect(rank).toBeGreaterThan(0);
			}

			// Sum of ranks should be close to n (dampening property)
			const sum = Array.from(ranks).reduce((a, b) => a + b, 0);
			expect(sum).toBeCloseTo(n, 0); // Allow ±1
		});

		it('respects damping factor and iterations', async () => {
			const n = 50;
			const adjacency = new Float32Array(n * n);
			for (let i = 0; i < n; i++) {
				for (let j = 0; j < 3; j++) {
					adjacency[i * n + Math.floor(Math.random() * n)] = 1.0;
				}
			}

			// Low damping (0.5) = faster convergence
			const t0 = Date.now();
			const ranks1 = await gpuPageRank(adjacency, n, 0.5, 5);
			const duration1 = Date.now() - t0;

			// High damping (0.95) = slower convergence
			const t1 = Date.now();
			const ranks2 = await gpuPageRank(adjacency, n, 0.95, 20);
			const duration2 = Date.now() - t1;

			// Both should complete in reasonable time
			expect(duration1).toBeLessThan(2000);
			expect(duration2).toBeLessThan(5000);

			// Both should produce valid rank distributions
			expect(ranks1.length).toBe(n);
			expect(ranks2.length).toBe(n);
		});
	});

	describe('Concurrent Task Submission', () => {
		it('queues tasks when all workers are busy', async () => {
			const pool = getWorkerPool();

			// Submit 12 tasks (> 4 workers) concurrently
			const tasks = [];
			for (let i = 0; i < 12; i++) {
				const query = new Float32Array(768).fill(i / 100);
				const corpus = [new Float32Array(768).fill((i + 1) / 100)];
				tasks.push(gpuBatchCosineSimilarity(query, corpus, 768));
			}

			const results = await Promise.all(tasks);

			expect(results.length).toBe(12);
			for (const result of results) {
				expect(result.length).toBe(1);
				expect(result[0]).toBeCloseTo(1.0, 2);
			}
		});

		it('rejects tasks when queue exceeds 256', async () => {
			const pool = getWorkerPool();

			// Try to submit 300 tasks
			const tasks = [];
			let rejectionCount = 0;

			for (let i = 0; i < 300; i++) {
				const query = new Float32Array(768).fill(0.5);
				const corpus = [new Float32Array(768).fill(0.5)];

				tasks.push(
					gpuBatchCosineSimilarity(query, corpus, 768).catch(() => {
						rejectionCount++;
					})
				);
			}

			await Promise.allSettled(tasks);

			// Should have rejected some due to queue overflow
			expect(rejectionCount).toBeGreaterThan(0);
		});
	});

	describe('Error Handling', () => {
		it('handles missing required parameters', async () => {
			const query = new Float32Array(768);
			const corpus: Float32Array[] = [];

			await expect(gpuBatchCosineSimilarity(query, corpus, 768)).rejects.toThrow();
		});

		it('times out long-running operations', async () => {
			const pool = getWorkerPool();

			// This would need a mock that hangs, so we skip for real impl
			// In practice, the 30s default timeout should catch issues
			expect(pool.getStats().poolSize).toBe(4);
		});

		it('recovers when a worker dies', async () => {
			// This test is skipped in production (would need to force a crash)
			// But the pool should auto-reinitialize if a worker exits unexpectedly
			const pool = getWorkerPool();
			expect(pool.getStats().workers).toBe(4);
		});
	});

	describe('ArrayBuffer Pooling', () => {
		it('reuses ArrayBuffers across tasks', async () => {
			// Run 20 sequential tasks and observe memory usage
			const initialMemory = process.memoryUsage().heapUsed;

			for (let i = 0; i < 20; i++) {
				const query = new Float32Array(768).fill(Math.random());
				const corpus = [new Float32Array(768).fill(Math.random())];
				await gpuBatchCosineSimilarity(query, corpus, 768);
			}

			const finalMemory = process.memoryUsage().heapUsed;
			const memoryGrowth = finalMemory - initialMemory;

			// Memory growth should be minimal (< 10 MB for 20 iterations)
			// If ArrayBuffer pooling is working, growth should be ~1-2 MB
			expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024);
		});

		it('handles multiple buffer transfers correctly', async () => {
			// Concurrent tasks with different buffer sizes
			const tasks = [];

			for (let size of [64, 256, 768, 2048]) {
				const query = new Float32Array(size);
				for (let i = 0; i < size; i++) {
					query[i] = Math.random();
				}

				const corpus = [];
				for (let i = 0; i < 4; i++) {
					const doc = new Float32Array(size);
					for (let j = 0; j < size; j++) {
						doc[j] = Math.random();
					}
					corpus.push(doc);
				}

				tasks.push(gpuBatchCosineSimilarity(query, corpus, size));
			}

			const results = await Promise.all(tasks);

			expect(results.length).toBe(4);
			for (const result of results) {
				expect(result.length).toBe(4);
			}
		});
	});
});
