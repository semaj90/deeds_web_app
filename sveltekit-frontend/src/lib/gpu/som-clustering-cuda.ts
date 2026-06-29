/**
 * SOM Clustering with GPU Acceleration (CUDA fallback to CPU)
 *
 * Self-Organizing Map (SOM) clustering using GPU-accelerated tensor operations.
 * Falls back to CPU if CUDA unavailable.
 *
 * Routes through tensorrt-worker-pool for multi-threaded GPU compute.
 */

import { gpuFindBMUBatch } from './tensorrt-worker-pool.js';

export interface BMUResult {
	cluster: number;
	distance: number;
}

export interface SOMClusterAssignment {
	index: number;
	cluster: number;
	distance: number;
}

export interface ComputeResult<T> {
	data: T;
	backend: 'cuda' | 'cpu';
	durationMs: number;
}

/**
 * Find Best Matching Unit (BMU) for a single embedding
 * CPU-only version (for initialization or small batches)
 */
export function findBMU(
	embedding: Float32Array,
	centroids: Float32Array,
	gridSize: number = 20
): BMUResult {
	const dim = embedding.length;
	const nCentroids = centroids.length / dim;
	let minDist = Infinity;
	let bestCluster = 0;

	for (let c = 0; c < nCentroids; c++) {
		let dist = 0;
		for (let d = 0; d < dim; d++) {
			const diff = embedding[d] - centroids[c * dim + d];
			dist += diff * diff;
		}
		dist = Math.sqrt(dist);
		if (dist < minDist) {
			minDist = dist;
			bestCluster = c;
		}
	}

	return { cluster: bestCluster, distance: minDist };
}

/**
 * Find BMU for a batch of embeddings using GPU acceleration
 */
export async function findBMUBatch(
	embeddings: Float32Array[],
	centroids: Float32Array,
	gridSize: number = 20
): Promise<ComputeResult<SOMClusterAssignment[]>> {
	const startTime = Date.now();

	try {
		// Try GPU path
		const gpuResults = await gpuFindBMUBatch(embeddings, centroids, gridSize);
		const assignments: SOMClusterAssignment[] = gpuResults.map((r, idx) => ({
			index: idx,
			cluster: r.cluster,
			distance: r.distance
		}));

		return {
			data: assignments,
			backend: 'cuda',
			durationMs: Date.now() - startTime
		};
	} catch (gpuError) {
		// Fallback to CPU
		const assignments: SOMClusterAssignment[] = [];
		const dim = embeddings[0]?.length || 0;

		for (let i = 0; i < embeddings.length; i++) {
			const result = findBMU(embeddings[i], centroids, gridSize);
			assignments.push({
				index: i,
				cluster: result.cluster,
				distance: result.distance
			});
		}

		return {
			data: assignments,
			backend: 'cpu',
			durationMs: Date.now() - startTime
		};
	}
}

/**
 * Get neighboring grid cells from a BMU position (Moore neighborhood)
 */
export function getGridNeighbors(
	bmuRow: number,
	bmuCol: number,
	radius: number,
	gridSize: number
): Array<{ row: number; col: number; distance: number }> {
	const neighbors: Array<{ row: number; col: number; distance: number }> = [];

	for (let r = Math.max(0, bmuRow - radius); r <= Math.min(gridSize - 1, bmuRow + radius); r++) {
		for (let c = Math.max(0, bmuCol - radius); c <= Math.min(gridSize - 1, bmuCol + radius); c++) {
			const dist = Math.sqrt((r - bmuRow) ** 2 + (c - bmuCol) ** 2);
			if (dist <= radius) {
				neighbors.push({ row: r, col: c, distance: dist });
			}
		}
	}

	return neighbors;
}

/**
 * Initialize SOM centroids randomly or from embeddings
 */
export function initializeCentroids(
	embeddings: Float32Array[],
	gridSize: number
): Float32Array {
	const nCentroids = gridSize * gridSize;
	const dim = embeddings[0]?.length || 768;
	const centroids = new Float32Array(nCentroids * dim);

	// Initialize with first N embeddings or random
	if (embeddings.length >= nCentroids) {
		for (let i = 0; i < nCentroids; i++) {
			centroids.set(embeddings[i], i * dim);
		}
	} else {
		// Random initialization from mean and std
		const mean = new Float32Array(dim);
		for (const emb of embeddings) {
			for (let d = 0; d < dim; d++) {
				mean[d] += emb[d];
			}
		}
		for (let d = 0; d < dim; d++) {
			mean[d] /= embeddings.length;
		}

		let std = 0;
		for (const emb of embeddings) {
			for (let d = 0; d < dim; d++) {
				std += (emb[d] - mean[d]) ** 2;
			}
		}
		std = Math.sqrt(std / (embeddings.length * dim));

		for (let i = 0; i < nCentroids; i++) {
			for (let d = 0; d < dim; d++) {
				centroids[i * dim + d] = mean[d] + (Math.random() - 0.5) * std * 2;
			}
		}
	}

	return centroids;
}

/**
 * Compute SOM neighborhood influence (Gaussian kernel)
 */
export function computeNeighborhoodInfluence(
	distance: number,
	sigma: number
): number {
	return Math.exp(-(distance * distance) / (2 * sigma * sigma));
}

/**
 * Update SOM centroids based on assignments and learning rate
 */
export function updateCentroids(
	embeddings: Float32Array[],
	assignments: SOMClusterAssignment[],
	centroids: Float32Array,
	learningRate: number = 0.1
): Float32Array {
	const dim = embeddings[0]?.length || 768;
	const nCentroids = centroids.length / dim;
	const newCentroids = new Float32Array(centroids);

	// Count points per cluster
	const counts = new Float32Array(nCentroids);
	const sums = new Float32Array(nCentroids * dim);

	for (let i = 0; i < assignments.length; i++) {
		const cluster = assignments[i].cluster;
		counts[cluster]++;
		for (let d = 0; d < dim; d++) {
			sums[cluster * dim + d] += embeddings[i][d];
		}
	}

	// Update centroids via gradient descent
	for (let c = 0; c < nCentroids; c++) {
		if (counts[c] > 0) {
			for (let d = 0; d < dim; d++) {
				const mean = sums[c * dim + d] / counts[c];
				newCentroids[c * dim + d] += learningRate * (mean - newCentroids[c * dim + d]);
			}
		}
	}

	return newCentroids;
}
