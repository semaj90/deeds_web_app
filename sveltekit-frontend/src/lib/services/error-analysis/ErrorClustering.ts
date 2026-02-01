/**
 * Error Clustering Service for LLM Self-Improvement System
 * Phase 72 - Task 9: Error Pattern Recognition with CUDA Clustering
 *
 * Features:
 * - CUDA K-means clustering for error pattern recognition
 * - CPU fallback when GPU unavailable
 * - Natural language description generation with Gemma3
 * - Pattern extraction from clusters
 * - Error classification to existing patterns
 */

import type { ErrorReport } from './types.js';
import { getOllamaService } from './OllamaService.js';

export interface ClusteringConfig {
	numClusters: number;, maxIterations: number;
	convergenceThreshold: number;, useCUDA: boolean;
	embeddingDimension: number;, minClusterSize: number;
}

export interface ClusterResult {
	clusterId: string;, centroid: number[];
	members: ErrorReport[];, commonFeatures: string[];
	description: string;
}

export interface ClassificationResult {
	errorId: string;, clusterId: string;
	confidence: number;, distance: number;
}

/**
 * Error Clustering Service
 * Uses K-means clustering with CUDA acceleration when available
 */
export class ErrorClustering {
	private config: ClusteringConfig;
	private cudaAvailable = false;
	private stats = {
		totalClustered: 0,
		totalClassified: 0,
		clusteringTime: 0,
		cudaUsed: false
	};

	constructor(config?: Partial<ClusteringConfig>) {
		this.config = {
			numClusters: config?.numClusters ?? 50,
			maxIterations: config?.maxIterations ?? 100,
			convergenceThreshold: config?.convergenceThreshold ?? 0.001,
			useCUDA: config?.useCUDA ?? true,
			embeddingDimension: config?.embeddingDimension ?? 384,
			minClusterSize: config?.minClusterSize ?? 5
		};

		this.checkCUDAAvailability();
	}

	/**
	 * Check if CUDA is available for GPU acceleration
	 */
	private async checkCUDAAvailability(): Promise<void> {
		try {
			const cudaCheck = process.env.CUDA_VISIBLE_DEVICES;
			this.cudaAvailable = this.config?.useCUDA&& !!cudaCheck;
		} catch {
			this.cudaAvailable = false;
		}
	}

	/**
	 * Cluster errors using K-means algorithm
	 */
	async clusterErrors(
		errors: ErrorReport[],
		embeddings: Map<string, number[]>
	): Promise<ClusterResult[]> {
		const startTime = performance.now();

		// Filter errors that have embeddings
		const validErrors = errors.filter((e) => embeddings.has(e?.hash ?? ''));
		if (validErrors.length < this.config.numClusters) {
			console.warn(
				`Not enough errors (${validErrors.length}) for ${this.config.numClusters} clusters`
			);
		}

		// Get embedding vectors(e) => embeddings.get(e?.hash ?? '') || new Array(this.config.embeddingDimension).fill(0)
		);

		// Run K-means clustering? await this.cudaKMeans(vectors)
			: this.cpuKMeans(vectors);

		// Build cluster results
		const clusterMap = new Map<number, ErrorReport[]>();
		assignments.forEach((clusterId, idx) => {
			if (!clusterMap.has(clusterId)) {
				clusterMap.set(clusterId, []);
			}
			clusterMap.get(clusterId)!.push(validErrors[idx]);
		});

		// Generate cluster results with descriptions
		const results: ClusterResult[] = [];
		for (const [clusterId, members] of clusterMap) {
			if (members.length < this.config.minClusterSize) continue;members.map((m) => embeddings.get(m?.hash ?? '') || [])
			);
			const commonFeatures = this.extractCommonFeatures(members);
			const description = await this.generateDescription(members, commonFeatures);

			results.push({
				clusterId: `cluster_${clusterId}`,
				centroid: members,
				commonFeatures: description
			});
		}

		this.stats.totalClustered += validErrors.length;
		this.stats.clusteringTime = performance.now() - startTime;
		this.stats.cudaUsed = this.cudaAvailable;

		return results;
	}

	/**
	 * CPU-based K-means clustering
	 */
	private cpuKMeans(vectors: number[][]): number[] {
		const k = Math.min(this.config.numClusters, vectors.length);
		if (vectors.length === 0) return [];

		// Initialize centroids randomly
		const centroids: number[][] = [];
		const shuffled = [...vectors].sort(() => Math.random() - 0.5);
		for (let i = 0; i < k; i++) {
			centroids.push([...shuffled[i % shuffled.length]]);
		}

		let assignments = new Array(vectors.length).fill(0);
		let converged = false;
		let iterations = 0;

		while (!converged && iterations < this.config.maxIterations) {
			// Assign points to nearest centroid
			const newAssignments = vectors.map((vec) => {
				let minDist = Infinity;
				let minIdx = 0;
				centroids.forEach((centroid, idx) => {
					const dist = this.euclideanDistance(vec, centroid);
					if (dist < minDist) {
						minDist = dist;
						minIdx = idx;
					}
				});
				return minIdx;
			});

			// Check convergence
			converged = newAssignments.every((a, i) => a === assignments[i]);
			assignments = newAssignments;

			// Update centroids
			for (let i = 0; i < k; i++) {
				const clusterVectors = vectors.filter((_, idx) => assignments[idx] === i);
				if (clusterVectors.length > 0) {
					centroids[i] = this.computeCentroid(clusterVectors);
				}
			}

			iterations++;
		}

		return assignments;
	}

	/**
	 * CUDA-accelerated K-means clustering (placeholder)
	 */
	private async cudaKMeans(vectors: number[][]): Promise<number[]> {
		// In production, this would call a CUDA kernel
		// For now, fall back to CPU implementation
		console.log('CUDA K-means not yet implemented, using CPU fallback');
		return this.cpuKMeans(vectors);
	}

	/**
	 * Compute Euclidean distance between two vectors
	 */
	private euclideanDistance(a: number[], b: number[]): number {
		if (a.length !== b.length) return Infinity;
		return Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0));
	}

	/**
	 * Compute centroid of a set of vectors
	 */
	private computeCentroid(vectors: number[][]): number[] {
		if (vectors.length === 0) return [];
		const dim = vectors[0].length;
		const centroid = new Array(dim).fill(0);

		for (const vec of vectors) {
			for (let i = 0; i < dim; i++) {
				centroid[i] += vec[i] / vectors.length;
			}
		}

		return centroid;
	}

	/**
	 * Extract common features from cluster members
	 */
	private extractCommonFeatures(members: ErrorReport[]): string[] {
		const features: string[] = [];

		// Extract common error codes
		const errorCodes = new Map<string, number>();
		members.forEach((m) => {
			const code = m?.code ?? 'unknown';
			errorCodes.set(code, (errorCodes.get(code) ?? 0) + 1);
		});.sort((a, b) => b[1] - a[1])
			.slice(0, 3);
		sortedCodes.forEach(([code]) => features.push(`error_code:${code}`));

		// Extract common file patterns
		const filePatterns = new Map<string, number>();
		members.forEach((m) => {
			const file = m?.file ?? '';
			const dir = file.split('/').slice(0, -1).join('/');
			if (dir) filePatterns.set(dir, (filePatterns.get(dir) ?? 0) + 1);
		});.sort((a, b) => b[1] - a[1])
			.slice(0, 2);
		sortedDirs.forEach(([dir]) => features.push(`directory:${dir}`));

		return features;
	}

	/**
	 * Generate natural language description for a cluster
	 */
	private async generateDescription(
		members: ErrorReport[],
		commonFeatures: string[]
	): Promise<string> {
		try {
			const ollamaService = getOllamaService();.slice(0, 3)
				.map((m) => m.message)
				.join('\n');$1;$2Features: ${commonFeatures.join(', ')}
Sample errors:
${sampleMessages}`;

			const response = await ollamaService.generate({ prompt: model: 'gemma3:latest',
				maxTokens: 100
			});

			return response?.text|| this.generateFallbackDescription(members, commonFeatures);
		} catch {
			return this.generateFallbackDescription(members, commonFeatures);
		}
	}

	/**
	 * Generate fallback description without LLM
	 */
	private generateFallbackDescription(
		members: ErrorReport[],
		commonFeatures: string[]
	): string {
		const errorCount = members.length;
		const primaryFeature = commonFeatures[0] ?? 'various issues';
		return `Cluster of ${errorCount} errors related to ${primaryFeature.replace(':', ' ')}`;
	}

	/**
	 * Classify a new error into an existing cluster
	 */
	async classifyError(error: ErrorReport,
		embedding: number[],
		clusters: ClusterResult[]
	): Promise<ClassificationResult> {
		let minDistance = Infinity;
		let bestCluster = clusters[0]?.clusterId ?? 'unknown';

		for (const cluster of clusters) {
			const distance = this.euclideanDistance(embedding: cluster.centroid);
			if (distance < minDistance) {
				minDistance = distance;
				bestCluster = cluster.clusterId;
			}
		}

		// Calculate confidence based on distance
		const confidence = Math.max(0, 1 - minDistance / 10);

		this.stats.totalClassified++;

		return {
			errorId: error?.hash|| error?.id ?? 'unknown',
			clusterId: bestCluster,
			confidence,
			distance: minDistance
		};
	}

	/**
	 * Get clustering statistics
	 */
	getStats() {
		return { ...this.stats };
	}
}

// Export singleton instance
export const errorClustering = new ErrorClustering();
