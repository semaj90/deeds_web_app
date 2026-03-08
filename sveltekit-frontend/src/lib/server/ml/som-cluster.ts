/**
 * Self-Organizing Map (SOM / Kohonen Network) Clustering
 *
 * Algorithm:
 *   1. Initialize 2D grid of neurons (e.g., 5×5 = 25 neurons) with random weights
 *   2. For each training iteration:
 *      a. Select random input vector
 *      b. Find Best Matching Unit (BMU) - neuron closest to input
 *      c. Update BMU and neighborhood neurons (Gaussian decay)
 *      d. Decrease learning rate and neighborhood radius over time
 *   3. Assign each document to its BMU
 *   4. Measure quality via quantization error
 *
 * Use Cases:
 *   - Topic clustering with 2D visualization (grid topology)
 *   - Hierarchical clustering (related neurons are spatially close)
 *   - Dimensionality reduction (768-dim → 2D grid coordinates)
 *
 * Usage:
 *   const som = new SOMClusterer(5, 5, 768, 100, 0.5, 2.5);
 *   const result = await som.train(documentEmbeddings);
 */

import type { SOMConfig, ClusterResult, DocumentCluster } from '$lib/types/api.js';

export interface SOMResult {
	clusters: number[]; // document index → neuron ID (0-24 for 5×5 grid)
	grid: number[][][]; // [gridWidth][gridHeight][768] - neuron weights
	gridWidth: number;
	gridHeight: number;
	quantizationError: number; // Average distance to BMU
	iterations: number;
	topographicError: number; // % of inputs where 1st and 2nd BMU are not neighbors
}

export class SOMClusterer {
	private grid: number[][][]; // [x][y][dim] - neuron weight vectors
	private gridWidth: number;
	private gridHeight: number;
	private dimensions: number;
	private maxIterations: number;
	private initialLearningRate: number;
	private initialRadius: number;

	constructor(
		gridWidth: number,
		gridHeight: number,
		dimensions: number,
		maxIterations: number = 100,
		initialLearningRate: number = 0.5,
		initialRadius?: number
	) {
		this.gridWidth = gridWidth;
		this.gridHeight = gridHeight;
		this.dimensions = dimensions;
		this.maxIterations = maxIterations;
		this.initialLearningRate = initialLearningRate;
		// Default radius: half the grid diagonal
		this.initialRadius = initialRadius ?? Math.sqrt(gridWidth * gridWidth + gridHeight * gridHeight) / 2;
		this.grid = [];

		this.initializeGrid();
	}

	/**
	 * Initialize grid neurons with random weights
	 * Each neuron is a 768-dim vector (matching document embeddings)
	 */
	private initializeGrid(): void {
		this.grid = [];
		for (let x = 0; x < this.gridWidth; x++) {
			this.grid[x] = [];
			for (let y = 0; y < this.gridHeight; y++) {
				// Initialize with small random values
				const weights = new Array(this.dimensions);
				for (let d = 0; d < this.dimensions; d++) {
					weights[d] = Math.random() * 0.1 - 0.05; // [-0.05, 0.05]
				}
				this.grid[x][y] = weights;
			}
		}
	}

	/**
	 * Euclidean distance between two vectors
	 */
	private euclideanDistance(a: number[], b: number[]): number {
		if (a.length !== b.length) return Infinity;
		let sumSquaredDiff = 0;
		for (let i = 0; i < a.length; i++) {
			const diff = a[i] - b[i];
			sumSquaredDiff += diff * diff;
		}
		return Math.sqrt(sumSquaredDiff);
	}

	/**
	 * Grid distance between two neurons (Manhattan distance on 2D grid)
	 */
	private gridDistance(x1: number, y1: number, x2: number, y2: number): number {
		return Math.abs(x1 - x2) + Math.abs(y1 - y2);
	}

	/**
	 * Find Best Matching Unit (BMU) for input vector
	 * Returns grid coordinates [x, y]
	 */
	private findBMU(input: number[]): [number, number] {
		let minDist = Infinity;
		let bmuX = 0;
		let bmuY = 0;

		for (let x = 0; x < this.gridWidth; x++) {
			for (let y = 0; y < this.gridHeight; y++) {
				const dist = this.euclideanDistance(input, this.grid[x][y]);
				if (dist < minDist) {
					minDist = dist;
					bmuX = x;
					bmuY = y;
				}
			}
		}

		return [bmuX, bmuY];
	}

	/**
	 * Neighborhood function (Gaussian decay)
	 * Returns influence of BMU on neuron at (x, y) given current radius
	 */
	private neighborhoodInfluence(
		bmuX: number,
		bmuY: number,
		x: number,
		y: number,
		radius: number
	): number {
		const dist = this.gridDistance(bmuX, bmuY, x, y);
		const radiusSquared = radius * radius;
		return Math.exp(-(dist * dist) / (2 * radiusSquared));
	}

	/**
	 * Update neuron weights based on BMU and neighborhood
	 */
	private updateWeights(
		input: number[],
		bmuX: number,
		bmuY: number,
		learningRate: number,
		radius: number
	): void {
		for (let x = 0; x < this.gridWidth; x++) {
			for (let y = 0; y < this.gridHeight; y++) {
				const influence = this.neighborhoodInfluence(bmuX, bmuY, x, y, radius);
				if (influence < 0.001) continue; // Skip neurons with negligible influence

				// Update each dimension
				for (let d = 0; d < this.dimensions; d++) {
					const delta = input[d] - this.grid[x][y][d];
					this.grid[x][y][d] += learningRate * influence * delta;
				}
			}
		}
	}

	/**
	 * Train SOM on input data
	 */
	async train(data: number[][]): Promise<SOMResult> {
		if (data.length === 0) {
			throw new Error('Cannot train SOM on empty dataset');
		}

		console.log(`[SOM] Training ${this.gridWidth}×${this.gridHeight} grid on ${data.length} samples...`);
		const startTime = Date.now();

		// Training loop
		for (let iter = 0; iter < this.maxIterations; iter++) {
			// Decay learning rate and radius linearly
			const progress = iter / this.maxIterations;
			const learningRate = this.initialLearningRate * (1 - progress);
			const radius = this.initialRadius * (1 - progress);

			// Process each input in random order
			const indices = Array.from({ length: data.length }, (_, i) => i);
			for (let i = indices.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[indices[i], indices[j]] = [indices[j], indices[i]];
			}

			for (const idx of indices) {
				const input = data[idx];
				const [bmuX, bmuY] = this.findBMU(input);
				this.updateWeights(input, bmuX, bmuY, learningRate, radius);
			}

			// Log progress every 10 iterations
			if ((iter + 1) % 10 === 0 || iter === this.maxIterations - 1) {
				console.log(
					`[SOM] Iteration ${iter + 1}/${this.maxIterations}: lr=${learningRate.toFixed(4)}, radius=${radius.toFixed(2)}`
				);
			}
		}

		// Assign each document to its BMU
		const clusters: number[] = [];
		let totalQuantizationError = 0;
		let topographicErrors = 0;

		for (const input of data) {
			const [bmuX, bmuY] = this.findBMU(input);
			const neuronId = bmuY * this.gridWidth + bmuX; // Linearize 2D coords
			clusters.push(neuronId);

			// Quantization error: distance to BMU
			const dist = this.euclideanDistance(input, this.grid[bmuX][bmuY]);
			totalQuantizationError += dist;

			// Topographic error: check if 2nd BMU is a neighbor
			let secondBMU: [number, number] = [0, 0];
			let secondMinDist = Infinity;
			for (let x = 0; x < this.gridWidth; x++) {
				for (let y = 0; y < this.gridHeight; y++) {
					if (x === bmuX && y === bmuY) continue;
					const d = this.euclideanDistance(input, this.grid[x][y]);
					if (d < secondMinDist) {
						secondMinDist = d;
						secondBMU = [x, y];
					}
				}
			}

			const gridDist = this.gridDistance(bmuX, bmuY, secondBMU[0], secondBMU[1]);
			if (gridDist > 1) {
				topographicErrors++;
			}
		}

		const quantizationError = totalQuantizationError / data.length;
		const topographicError = topographicErrors / data.length;
		const elapsedMs = Date.now() - startTime;

		console.log(
			`[SOM] Training complete in ${elapsedMs}ms: quantizationError=${quantizationError.toFixed(4)}, topographicError=${(topographicError * 100).toFixed(2)}%`
		);

		return {
			clusters,
			grid: this.grid,
			gridWidth: this.gridWidth,
			gridHeight: this.gridHeight,
			quantizationError,
			iterations: this.maxIterations,
			topographicError
		};
	}

	/**
	 * Compute per-document novelty scores
	 * Novelty = 1 - similarity to BMU (how far the document is from its cluster center)
	 * High novelty = document doesn't fit neatly into any cluster = potentially interesting
	 */
	computeNovelty(data: number[][], somResult: SOMResult): number[] {
		const noveltyScores: number[] = [];

		for (let i = 0; i < data.length; i++) {
			const neuronId = somResult.clusters[i];
			const x = neuronId % somResult.gridWidth;
			const y = Math.floor(neuronId / somResult.gridWidth);
			const bmuDist = this.euclideanDistance(data[i], somResult.grid[x][y]);

			// Normalize novelty: clamp distance to [0, 1]
			// Typical embedding distances range 0-2 for L2-normed vectors
			const novelty = Math.min(1, bmuDist / 2);
			noveltyScores.push(novelty);
		}

		return noveltyScores;
	}

	/**
	 * Count cross-cluster documents — documents whose BMU and 2nd-BMU
	 * are in different grid regions (distance > 1 on the grid).
	 * These are "bridge" documents connecting different topic areas.
	 */
	crossClusterCount(data: number[][], somResult: SOMResult): {
		bridgeCount: number;
		bridgeIndices: number[];
	} {
		const bridgeIndices: number[] = [];

		for (let i = 0; i < data.length; i++) {
			const [bmuX, bmuY] = this.findBMU(data[i]);

			// Find 2nd BMU
			let secondMinDist = Infinity;
			let secondX = 0;
			let secondY = 0;
			for (let x = 0; x < this.gridWidth; x++) {
				for (let y = 0; y < this.gridHeight; y++) {
					if (x === bmuX && y === bmuY) continue;
					const d = this.euclideanDistance(data[i], this.grid[x][y]);
					if (d < secondMinDist) {
						secondMinDist = d;
						secondX = x;
						secondY = y;
					}
				}
			}

			const gridDist = this.gridDistance(bmuX, bmuY, secondX, secondY);
			if (gridDist > 1) {
				bridgeIndices.push(i);
			}
		}

		return { bridgeCount: bridgeIndices.length, bridgeIndices };
	}

	/**
	 * Convert SOM result to ClusterResult format for API response
	 */
	static toClusterResult(
		somResult: SOMResult,
		documentIds: string[],
		includeEmbeddings: boolean
	): ClusterResult {
		const clusterMap = new Map<number, string[]>();

		// Group documents by neuron ID
		for (let i = 0; i < somResult.clusters.length; i++) {
			const neuronId = somResult.clusters[i];
			const documentId = documentIds[i];

			if (!clusterMap.has(neuronId)) {
				clusterMap.set(neuronId, []);
			}
			clusterMap.get(neuronId)!.push(documentId);
		}

		// Build cluster array
		const clusters: DocumentCluster[] = [];
		for (let neuronId = 0; neuronId < somResult.gridWidth * somResult.gridHeight; neuronId++) {
			const docs = clusterMap.get(neuronId) ?? [];
			if (docs.length === 0) continue; // Skip empty neurons

			// Get neuron coordinates
			const x = neuronId % somResult.gridWidth;
			const y = Math.floor(neuronId / somResult.gridWidth);

			clusters.push({
				id: `som-${x}-${y}`,
				centroid: includeEmbeddings ? somResult.grid[x][y] : [],
				documents: docs,
				size: docs.length,
				label: `SOM Grid [${x},${y}]`,
				metadata: {
					gridX: x,
					gridY: y,
					neuronId
				}
			});
		}

		// SOM doesn't have a silhouette score, use inverse quantization error as quality metric
		// Normalize to [0, 1] range (lower quantization error = higher quality)
		const normalizedQuality = Math.max(0, 1 - somResult.quantizationError / 10);

		return {
			clusters,
			clusterId: `som-${Date.now()}`,
			silhouetteScore: normalizedQuality,
			iterations: somResult.iterations,
			converged: true
		};
	}
}