/**
 * K-Means Clustering for Document Topic Modeling
 * Ported from Python sklearn.cluster.KMeans with stability enhancements
 *
 * Algorithm:
 *   1. Initialize k=15 centroids via k-means++ (Weibull-distributed seed selection)
 *   2. Assign each document to nearest centroid (Euclidean distance)
 *   3. Update centroids as mean of assigned points
 *   4. Repeat until convergence (Frobenius norm < epsilon)
 *   5. Measure cluster quality via silhouette coefficient
 *
 * Usage:
 *   const clusterer = new KMeansClusterer(15, 100, 1e-4);
 *   const { clusters, centroids, silhouetteScore } = await clusterer.fit(documentEmbeddings);
 */

import { cosineSimilarity } from '$lib/ai/client-embed.js';
import { getComputePool } from '$lib/server/workers/compute-pool.js';

export interface ClusterResult {
	clusters: number[]; // document index → cluster ID mapping
	centroids: number[][]; // k=15 cluster centers (768-dim)
	silhouetteScore: number; // Overall cluster quality [0, 1]
	iterations: number; // Actual iterations until convergence
	inertia: number; // Sum of squared distances to nearest centroid
}

export interface SilhouetteMetrics {
	scores: number[]; // Per-document silhouette scores
	mean: number; // Mean silhouette score across all documents
	samples: number; // Total documents scored
}

/**
 * Euclidean distance between two vectors (optimized)
 */
function euclideanDistance(a: number[], b: number[]): number {
	if (a.length !== b.length) return Infinity;
	let sumSquaredDiff = 0;
	for (let i = 0; i < a.length; i++) {
		const diff = a[i] - b[i];
		sumSquaredDiff += diff * diff;
	}
	return Math.sqrt(sumSquaredDiff);
}

/**
 * Initialize k centroids via k-means++ (Weibull-distributed seeding)
 * Selects first centroid randomly, then each subsequent centroid with probability
 * proportional to D(x)^2 where D(x) is distance to nearest existing centroid.
 */
function initializeCentroidsKMeansPlusPlus(
	data: number[][],
	k: number
): number[][] {
	if (k > data.length) throw new Error(`Cannot initialize ${k} clusters from ${data.length} samples`);

	const centroids: number[][] = [];
	const indices = new Set<number>();

	// 1. Choose first centroid randomly
	const firstIdx = Math.floor(Math.random() * data.length);
	centroids.push([...data[firstIdx]]);
	indices.add(firstIdx);

	// 2. Choose remaining k-1 centroids
	for (let c = 1; c < k; c++) {
		const distances = new Float32Array(data.length);
		let maxDist = 0;

		// Compute D(x)^2 for each point (distance to nearest centroid)
		for (let i = 0; i < data.length; i++) {
			if (indices.has(i)) {
				distances[i] = 0;
				continue;
			}

			let minDist = Infinity;
			for (const centroid of centroids) {
				const d = euclideanDistance(data[i], centroid);
				if (d < minDist) minDist = d;
			}
			distances[i] = minDist * minDist;
			maxDist = Math.max(maxDist, distances[i]);
		}

		// Choose next centroid with probability D(x)^2 / sum(D(x)^2)
		const sumDist = Array.from(distances).reduce((a, b) => a + b, 0);
		if (sumDist === 0) {
			// If all remaining points are equidistant, choose randomly
			let randIdx;
			do {
				randIdx = Math.floor(Math.random() * data.length);
			} while (indices.has(randIdx));
			centroids.push([...data[randIdx]]);
			indices.add(randIdx);
		} else {
			let cumulative = 0;
			const threshold = Math.random() * sumDist;
			for (let i = 0; i < data.length; i++) {
				if (!indices.has(i)) {
					cumulative += distances[i];
					if (cumulative >= threshold) {
						centroids.push([...data[i]]);
						indices.add(i);
						break;
					}
				}
			}
		}
	}

	return centroids;
}

/**
 * Assign each document to nearest centroid
 */
function assignClusters(data: number[][], centroids: number[][]): number[] {
	const assignments = new Array(data.length);
	for (let i = 0; i < data.length; i++) {
		let minDist = Infinity;
		let bestCluster = 0;
		for (let c = 0; c < centroids.length; c++) {
			const d = euclideanDistance(data[i], centroids[c]);
			if (d < minDist) {
				minDist = d;
				bestCluster = c;
			}
		}
		assignments[i] = bestCluster;
	}
	return assignments;
}

/**
 * Update centroids as mean of assigned points
 */
function updateCentroids(
	data: number[][],
	assignments: number[],
	k: number,
	dims: number
): number[][] {
	const newCentroids = Array.from({ length: k }, () => new Array(dims).fill(0));
	const counts = new Array(k).fill(0);

	for (let i = 0; i < data.length; i++) {
		const cluster = assignments[i];
		counts[cluster]++;
		for (let d = 0; d < dims; d++) {
			newCentroids[cluster][d] += data[i][d];
		}
	}

	// Normalize by count
	for (let c = 0; c < k; c++) {
		if (counts[c] > 0) {
			for (let d = 0; d < newCentroids[c].length; d++) {
				newCentroids[c][d] /= counts[c];
			}
		}
	}

	return newCentroids;
}

/**
 * Compute Frobenius norm of difference between old and new centroids
 */
function centroidShift(oldCentroids: number[][], newCentroids: number[][]): number {
	let sumSquared = 0;
	for (let c = 0; c < oldCentroids.length; c++) {
		for (let d = 0; d < oldCentroids[c].length; d++) {
			const diff = oldCentroids[c][d] - newCentroids[c][d];
			sumSquared += diff * diff;
		}
	}
	return Math.sqrt(sumSquared);
}

/**
 * Compute inertia (sum of squared distances to nearest centroid)
 */
function computeInertia(data: number[][], assignments: number[], centroids: number[][]): number {
	let inertia = 0;
	for (let i = 0; i < data.length; i++) {
		const centroid = centroids[assignments[i]];
		const dist = euclideanDistance(data[i], centroid);
		inertia += dist * dist;
	}
	return inertia;
}

/**
 * Compute per-point silhouette scores
 * silhouette(i) = (b(i) - a(i)) / max(a(i), b(i))
 * where:
 *   a(i) = mean distance from point i to all other points in its cluster
 *   b(i) = mean distance from point i to all points in nearest neighboring cluster
 */
function computeSilhouette(
	data: number[][],
	assignments: number[],
	k: number
): SilhouetteMetrics {
	const silhouettes = new Array(data.length);
	const clusterPoints: Set<number>[] = Array.from({ length: k }, () => new Set());

	// Group points by cluster
	for (let i = 0; i < data.length; i++) {
		clusterPoints[assignments[i]].add(i);
	}

	// Compute silhouette for each point
	for (let i = 0; i < data.length; i++) {
		const cluster = assignments[i];
		const clusterMembers = Array.from(clusterPoints[cluster]);

		// a(i) = mean distance to points in same cluster
		let aSum = 0;
		if (clusterMembers.length > 1) {
			for (const j of clusterMembers) {
				if (i !== j) {
					aSum += euclideanDistance(data[i], data[j]);
				}
			}
			aSum /= clusterMembers.length - 1;
		}

		// b(i) = min(mean distance to points in other clusters)
		let bMin = Infinity;
		for (let c = 0; c < k; c++) {
			if (c !== cluster && clusterPoints[c].size > 0) {
				let bSum = 0;
				for (const j of clusterPoints[c]) {
					bSum += euclideanDistance(data[i], data[j]);
				}
				const bAvg = bSum / clusterPoints[c].size;
				bMin = Math.min(bMin, bAvg);
			}
		}

		// silhouette(i) = (b(i) - a(i)) / max(a(i), b(i))
		if (bMin === Infinity) {
			silhouettes[i] = 0; // Only one cluster exists
		} else {
			const denom = Math.max(aSum, bMin);
			silhouettes[i] = denom > 0 ? (bMin - aSum) / denom : 0;
		}
	}

	const mean = silhouettes.reduce((a, b) => a + b, 0) / data.length;

	return {
		scores: silhouettes,
		mean,
		samples: data.length
	};
}

export class KMeansClusterer {
	private k: number;
	private maxIterations: number;
	private epsilon: number;

	constructor(k = 15, maxIterations = 100, epsilon = 1e-4) {
		this.k = k;
		this.maxIterations = maxIterations;
		this.epsilon = epsilon;
	}

	/**
	 * Fit k-means clustering to document embeddings.
	 * Offloads to worker_threads to avoid blocking the event loop.
	 * Falls back to main-thread execution if workers are unavailable.
	 */
	async fit(embeddings: number[][]): Promise<ClusterResult> {
		if (embeddings.length === 0) {
			throw new Error('Cannot cluster empty dataset');
		}
		if (embeddings.length < this.k) {
			console.warn(
				`[KMeans] Dataset size (${embeddings.length}) < k (${this.k}), reducing k`
			);
			this.k = Math.max(1, embeddings.length - 1);
		}

		// Offload to worker pool (non-blocking)
		try {
			const pool = getComputePool();
			return await pool.run<ClusterResult>('kmeans', {
				embeddings,
				k: this.k,
				maxIterations: this.maxIterations,
				epsilon: this.epsilon,
			}, 60_000);
		} catch {
			// Worker unavailable — fall back to main thread
			console.warn('[KMeans] Worker pool unavailable, running on main thread');
		}

		return this.fitMainThread(embeddings);
	}

	/** Main-thread fallback for fit() */
	private fitMainThread(embeddings: number[][]): ClusterResult {
		const dims = embeddings[0].length;
		let centroids = initializeCentroidsKMeansPlusPlus(embeddings, this.k);
		let assignments = assignClusters(embeddings, centroids);
		let iterations = 0;

		while (iterations < this.maxIterations) {
			const newCentroids = updateCentroids(embeddings, assignments, this.k, dims);
			const shift = centroidShift(centroids, newCentroids);
			centroids = newCentroids;
			assignments = assignClusters(embeddings, centroids);
			iterations++;
			if (shift < this.epsilon) break;
		}

		const inertia = computeInertia(embeddings, assignments, centroids);
		const silhouetteMetrics = computeSilhouette(embeddings, assignments, this.k);

		return {
			clusters: assignments,
			centroids,
			silhouetteScore: silhouetteMetrics.mean,
			iterations,
			inertia
		};
	}

	/**
	 * Compute silhouette score for existing clustering
	 */
	computeMetrics(embeddings: number[][], assignments: number[]): SilhouetteMetrics {
		return computeSilhouette(embeddings, assignments, this.k);
	}

	/**
	 * Count cross-cluster connections — documents that are near the boundary
	 * between two clusters (within 10% of the distance to 2nd nearest centroid).
	 * High cross-cluster count indicates topics that blend together.
	 */
	crossClusterConnections(
		embeddings: number[][],
		assignments: number[],
		centroids: number[][]
	): { pairs: Map<string, number>; totalBridgeDocs: number } {
		const pairs = new Map<string, number>();
		let totalBridgeDocs = 0;

		for (let i = 0; i < embeddings.length; i++) {
			const assigned = assignments[i];
			const assignedDist = euclideanDistance(embeddings[i], centroids[assigned]);

			// Find 2nd nearest centroid
			let secondDist = Infinity;
			let secondCluster = -1;
			for (let c = 0; c < centroids.length; c++) {
				if (c === assigned) continue;
				const d = euclideanDistance(embeddings[i], centroids[c]);
				if (d < secondDist) {
					secondDist = d;
					secondCluster = c;
				}
			}

			// Bridge document: within 10% distance to 2nd cluster
			if (secondCluster >= 0 && secondDist < assignedDist * 1.1) {
				totalBridgeDocs++;
				const pairKey = `${Math.min(assigned, secondCluster)}-${Math.max(assigned, secondCluster)}`;
				pairs.set(pairKey, (pairs.get(pairKey) ?? 0) + 1);
			}
		}

		return { pairs, totalBridgeDocs };
	}

	/**
	 * Contextual pattern update — shift centroids toward high-feedback documents.
	 * Documents with feedback > 0.5 (positive) pull their cluster centroid slightly
	 * toward them, biasing future clustering toward user-preferred patterns.
	 *
	 * @param embeddings - Document embeddings
	 * @param assignments - Current cluster assignments
	 * @param centroids - Current centroids (mutated in-place)
	 * @param feedbackScores - Map of document index → feedback score [0,1]
	 * @param learningRate - How much centroids shift (0.04 default)
	 */
	contextualPatternUpdate(
		embeddings: number[][],
		assignments: number[],
		centroids: number[][],
		feedbackScores: Map<number, number>,
		learningRate = 0.04
	): void {
		for (const [docIdx, feedback] of feedbackScores) {
			if (feedback <= 0.5 || docIdx >= embeddings.length) continue;

			const cluster = assignments[docIdx];
			const centroid = centroids[cluster];
			const embedding = embeddings[docIdx];
			const weight = (feedback - 0.5) * 2 * learningRate; // Scale 0.5-1.0 → 0-learningRate

			for (let d = 0; d < centroid.length; d++) {
				centroid[d] += weight * (embedding[d] - centroid[d]);
			}
		}
	}
}
