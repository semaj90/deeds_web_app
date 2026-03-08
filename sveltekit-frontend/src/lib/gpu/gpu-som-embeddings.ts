/**
 * GPU-Accelerated SOM Embeddings
 *
 * Bridges the WebGPU compute pipeline (gpu-compute-pipeline.ts) with the
 * SOM clustering algorithm (som-cluster.ts) for GPU-accelerated distance
 * computation during training and BMU search.
 *
 * Key acceleration points:
 *   1. BMU search: GPU batch cosine similarity for all neurons at once
 *   2. Batch assignment: GPU parallel distance for all documents × all neurons
 *   3. Novelty computation: GPU batch similarity against all cluster centers
 *
 * Fallback: CPU via SOMClusterer when WebGPU unavailable
 *
 * Usage:
 *   const gpuSom = new GPUSOMEmbeddings(5, 5, 768);
 *   const result = await gpuSom.train(embeddings);
 */

import { browser } from '$app/environment';
import { getGPUCompute, getCachedGPUCompute, type ComputeResult } from './gpu-compute-pipeline.js';
import { SOMClusterer, type SOMResult } from '$lib/server/ml/som-cluster.js';

export interface GPUSOMConfig {
	gridWidth: number;
	gridHeight: number;
	dimensions: number;
	maxIterations?: number;
	initialLearningRate?: number;
	initialRadius?: number;
}

export interface GPUSOMResult extends SOMResult {
	backend: 'webgpu' | 'cpu';
	gpuAcceleratedSteps: number;
	totalDurationMs: number;
}

/**
 * GPU-accelerated SOM with WebGPU → CPU fallback
 *
 * Accelerates the most expensive SOM operation: finding the Best Matching Unit
 * for each document (O(N × gridW × gridH × dims) distance computations per epoch).
 */
export class GPUSOMEmbeddings {
	private som: SOMClusterer;
	private config: GPUSOMConfig;

	constructor(config: GPUSOMConfig) {
		this.config = config;
		this.som = new SOMClusterer(
			config.gridWidth,
			config.gridHeight,
			config.dimensions,
			config.maxIterations ?? 100,
			config.initialLearningRate ?? 0.5,
			config.initialRadius
		);
	}

	/**
	 * Train SOM with GPU-accelerated BMU search where possible
	 *
	 * The SOM training loop itself runs on CPU (weight updates are inherently sequential),
	 * but batch operations (assignment, novelty) use GPU when available.
	 */
	async train(data: number[][]): Promise<GPUSOMResult> {
		const startTime = performance.now();
		let gpuSteps = 0;

		// Attempt GPU initialization
		const gpu = browser ? getCachedGPUCompute() ?? (await getGPUCompute().catch(() => null)) : null;

		// Train SOM (CPU — sequential weight updates require it)
		const somResult = await this.som.train(data);

		// If GPU available, re-compute batch assignments with GPU acceleration
		if (gpu) {
			try {
				const neuronCount = this.config.gridWidth * this.config.gridHeight;
				const dims = this.config.dimensions;

				// Flatten all neuron weights into a single Float32Array for GPU batch similarity
				const neuronWeights = new Float32Array(neuronCount * dims);
				for (let x = 0; x < this.config.gridWidth; x++) {
					for (let y = 0; y < this.config.gridHeight; y++) {
						const neuronIdx = y * this.config.gridWidth + x;
						const weights = somResult.grid[x][y];
						neuronWeights.set(weights, neuronIdx * dims);
					}
				}

				// GPU batch assignment: for each document, find nearest neuron
				for (let i = 0; i < data.length; i++) {
					const query = new Float32Array(data[i]);
					const result = await gpu.cosineSimilarity(query, neuronWeights, neuronCount);

					// Find max similarity (= min distance for normalized vectors)
					let bestNeuron = 0;
					let bestSim = -Infinity;
					for (let n = 0; n < neuronCount; n++) {
						if (result.data[n] > bestSim) {
							bestSim = result.data[n];
							bestNeuron = n;
						}
					}

					somResult.clusters[i] = bestNeuron;
					gpuSteps++;
				}

				console.log(`[GPU-SOM] GPU-accelerated ${gpuSteps} BMU assignments`);
			} catch (e) {
				console.warn('[GPU-SOM] GPU batch assignment failed, using CPU results:', e);
			}
		}

		const totalDurationMs = performance.now() - startTime;

		return {
			...somResult,
			backend: gpuSteps > 0 ? 'webgpu' : 'cpu',
			gpuAcceleratedSteps: gpuSteps,
			totalDurationMs
		};
	}

	/**
	 * Batch compute novelty scores using GPU
	 * For each document, computes distance to its BMU neuron
	 */
	async batchNovelty(data: number[][], somResult: SOMResult): Promise<ComputeResult<Float32Array>> {
		const gpu = browser ? getCachedGPUCompute() : null;
		const startTime = performance.now();

		// Collect each document's BMU weight vector
		const dims = this.config.dimensions;
		const bmuWeights = new Float32Array(data.length * dims);

		for (let i = 0; i < data.length; i++) {
			const neuronId = somResult.clusters[i];
			const x = neuronId % somResult.gridWidth;
			const y = Math.floor(neuronId / somResult.gridWidth);
			bmuWeights.set(somResult.grid[x][y], i * dims);
		}

		if (gpu) {
			try {
				// Compute novelty as 1 - similarity(doc, bmu) for each pair
				const noveltyScores = new Float32Array(data.length);
				for (let i = 0; i < data.length; i++) {
					const query = new Float32Array(data[i]);
					const bmuSlice = bmuWeights.slice(i * dims, (i + 1) * dims);
					const result = await gpu.cosineSimilarity(query, bmuSlice, 1);
					noveltyScores[i] = Math.max(0, Math.min(1, 1 - result.data[0]));
				}

				return {
					data: noveltyScores,
					backend: 'webgpu',
					durationMs: performance.now() - startTime
				};
			} catch {
				// Fall through to CPU
			}
		}

		// CPU fallback — use SOMClusterer's built-in novelty
		const scores = this.som.computeNovelty(data, somResult);
		return {
			data: new Float32Array(scores),
			backend: 'cpu',
			durationMs: performance.now() - startTime
		};
	}
}

/**
 * Factory: create GPU-accelerated SOM for standard 768-dim embeddings
 */
export function createGPUSOM(
	gridWidth = 5,
	gridHeight = 5,
	maxIterations = 100
): GPUSOMEmbeddings {
	return new GPUSOMEmbeddings({
		gridWidth,
		gridHeight,
		dimensions: 768,
		maxIterations
	});
}
