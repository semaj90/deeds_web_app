/**
 * SOM Clustering with CUDA Worker Pool
 *
 * Wrapper that routes findBMU operations through TensorRT worker pool
 * for real GPU acceleration. Falls back to CPU if workers unavailable.
 *
 * Replaces pseudo-GPU som-clustering.ts with live CUDA execution.
 */

import { gpuFindBMUBatch, getWorkerPool, type ComputeResult } from './tensorrt-worker-pool.js';

export interface SOMClusterAssignment {
	packetId: string;
	embedding: Float32Array;
	somRow: number;
	somCol: number;
	somCluster: number;
	distance: number;
}

export interface SOMGridState {
	gridSize: number;
	embeddingDim: number;
	centroids: Float32Array;
	lastUpdated: number;
	trainingComplete: boolean;
}

export interface BMUResult {
	bmuIdx: number;
	bmuRow: number;
	bmuCol: number;
	distance: number;
}

const SOMConfig = {
	gridSize: 20,
	embeddingDim: 768,
	numCells: 400
};

/**
 * Find Best Matching Unit for single embedding (CUDA-accelerated)
 */
export async function findBMU(
	embedding: Float32Array,
	centroids: Float32Array,
	gridSize: number = 20
): Promise<BMUResult> {
	try {
		const results = await gpuFindBMUBatch([embedding], centroids, gridSize);
		const result = results[0];

		return {
			bmuIdx: result.cluster,
			bmuRow: Math.floor(result.cluster / gridSize),
			bmuCol: result.cluster % gridSize,
			distance: result.distance
		};
	} catch (err) {
		// Fallback: CPU computation
		return findBMUCPU(embedding, centroids, gridSize);
	}
}

/**
 * Batch find Best Matching Unit (CUDA-accelerated)
 */
export async function findBMUBatch(
	embeddings: Float32Array[],
	centroids: Float32Array,
	gridSize: number = 20
): Promise<ComputeResult<SOMClusterAssignment[]>> {
	const t0 = Date.now();

	if (embeddings.length === 0) {
		return {
			data: [],
			backend: 'cpu',
			durationMs: 0
		};
	}

	try {
		// Try GPU acceleration first
		const results = await gpuFindBMUBatch(embeddings, centroids, gridSize);

		const assignments: SOMClusterAssignment[] = results.map((result, idx) => {
			const bmuRow = Math.floor(result.cluster / gridSize);
			const bmuCol = result.cluster % gridSize;

			return {
				packetId: `packet-${idx}`,
				embedding: embeddings[idx],
				somRow: bmuRow,
				somCol: bmuCol,
				somCluster: result.cluster,
				distance: result.distance
			};
		});

		return {
			data: assignments,
			backend: 'cuda',
			durationMs: Date.now() - t0
		};
	} catch (err) {
		// Fallback: CPU computation
		console.warn('[SOM-CUDA] GPU acceleration unavailable, falling back to CPU:', (err as Error).message);

		const assignments: SOMClusterAssignment[] = [];
		for (let i = 0; i < embeddings.length; i++) {
			const bmuResult = findBMUCPU(embeddings[i], centroids, gridSize);

			assignments.push({
				packetId: `packet-${i}`,
				embedding: embeddings[i],
				somRow: bmuResult.bmuRow,
				somCol: bmuResult.bmuCol,
				somCluster: bmuResult.bmuIdx,
				distance: bmuResult.distance
			});
		}

		return {
			data: assignments,
			backend: 'cpu',
			durationMs: Date.now() - t0
		};
	}
}

/**
 * CPU fallback: Find BMU using L2 distance
 */
function findBMUCPU(embedding: Float32Array, centroids: Float32Array, gridSize: number): BMUResult {
	const dim = embedding.length;
	const numCells = gridSize * gridSize;

	let minDist = Infinity;
	let bmuIdx = 0;

	for (let c = 0; c < numCells; c++) {
		let distSq = 0;
		const centroidOffset = c * dim;

		for (let d = 0; d < dim; d++) {
			const diff = embedding[d] - centroids[centroidOffset + d];
			distSq += diff * diff;
		}

		const dist = Math.sqrt(distSq);
		if (dist < minDist) {
			minDist = dist;
			bmuIdx = c;
		}
	}

	return {
		bmuIdx,
		bmuRow: Math.floor(bmuIdx / gridSize),
		bmuCol: bmuIdx % gridSize,
		distance: minDist
	};
}

/**
 * Grid neighbor expansion with topology awareness
 */
export function getGridNeighbors(
	bmuRow: number,
	bmuCol: number,
	radius: number,
	gridSize: number = 20
): Array<{ row: number; col: number; distance: number }> {
	const neighbors = [];

	for (let r = bmuRow - radius; r <= bmuRow + radius; r++) {
		for (let c = bmuCol - radius; c <= bmuCol + radius; c++) {
			if (r >= 0 && r < gridSize && c >= 0 && c < gridSize) {
				const dist = Math.sqrt((r - bmuRow) ** 2 + (c - bmuCol) ** 2);
				neighbors.push({ row: r, col: c, distance: dist });
			}
		}
	}

	return neighbors.sort((a, b) => a.distance - b.distance);
}

/**
 * Initialize centroids (random or from data)
 */
export function initializeCentroids(
	embeddings: Float32Array[],
	gridSize: number = 20
): Float32Array {
	const numCells = gridSize * gridSize;
	const dim = 768;
	const centroids = new Float32Array(numCells * dim);

	// Random initialization from uniform distribution
	for (let i = 0; i < numCells * dim; i++) {
		centroids[i] = Math.random();
	}

	return centroids;
}

export { SOMConfig };
