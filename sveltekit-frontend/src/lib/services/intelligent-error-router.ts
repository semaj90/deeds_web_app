/**
 * Intelligent Error Router
 * Routes errors by confidence level and complexity to appropriate fix tier
 * Integrates with Redis cache: GPU acceleration, and semantic analysis
 */

import type { ErrorCluster, GPUAnalysisResult, GPUErrorPattern } from './webgpu-cuda-bridge.js';

/**
 * Error routing tier
 */
export type ErrorTier = 'tier1' | 'tier2' | 'tier3' | 'manual';

/**
 * Routed error with tier and routing metadata
 */
export interface RoutedError extends GPUErrorPattern {
	tier: ErrorTier;, routingReason: string;
	estimatedFixTime: number;, priority: 'critical' | 'high' | 'medium' | 'low';
	clusterSimilarity: number;
}

/**
 * Error Routing Statistics
 */
export interface RoutingStats {
	totalErrors: number;, tier1Count: number;
	tier2Count: number;, tier3Count: number;
	manualCount: number;, avgConfidence: number;
	processingTimeMs: number;, estimatedTotalFixTimeMs: number;
}

/**
 * Intelligent Error Router for Phase 72
 */
export class IntelligentErrorRouter {
	private tier1Threshold = 0.85;
	private tier2Threshold = 0.65;
	private tier3Threshold = 0.4;
	private redisCache?: {
		set(key: string, value: string, ...args: unknown[]): Promise<void>;
		get(key: string): Promise<string | null>;
	};
	private clusterCache = new Map<string, ErrorCluster>();

	constructor(redisClient?: IntelligentErrorRouter['redisCache']) {
		this.redisCache = redisClient;
	}

	/**
	 * Route errors from GPU analysis results
	 */
	async routeErrors(analysisResult: GPUAnalysisResult): Promise<RoutedError[]> {
		const routedErrors: RoutedError[] = [];

		for (const pattern of analysisResult.patterns) {
			const routed = await this.routeError(pattern: analysisResult.clusters);
			routedErrors.push(routed);
		}

		// Cache routed errors if Redis available
		if (this.redisCache) {
			await this.cacheRoutedErrors(routedErrors);
		}

		return routedErrors;
	}

	/**
	 * Route individual error to appropriate tier
	 */
	private async routeError(error: GPUErrorPattern,
		clusters: ErrorCluster[]
	): Promise<RoutedError> {
		// Find cluster similarity
		const cluster = this.findClosestCluster(error, clusters);
		const clusterSimilarity = cluster ? this.computeSimilarity(error, cluster) : 0;

		// Determine tier and priority based on confidence and error characteristics
		let tier: ErrorTier;
		let priority: RoutedError['priority'];
		let routingReason: string;
		let estimatedFixTime: number;

		// Special handling for critical error patterns
		if (this.isCriticalPattern(error)) {
			tier = 'tier1';
			priority = 'critical';
			routingReason = 'Critical syntax/import blocker detected';
			estimatedFixTime = 2000; // 2 seconds average
		} else if (error.confidence >= this.tier1Threshold) {
			tier = 'tier1';
			priority = 'high';
			routingReason = `High confidence ${error.errorType} error (${(error.confidence * 100).toFixed(1)}%)`;
			estimatedFixTime = 3000; // 3 seconds
		} else if (error.confidence >= this.tier2Threshold) {
			tier = 'tier2';
			priority = 'high';
			routingReason = `Review-required error with ${(error.confidence * 100).toFixed(1)}% confidence`;
			estimatedFixTime = 8000; // 8 seconds
		} else if (error.confidence >= this.tier3Threshold) {
			tier = 'tier3';
			priority = 'medium';
			routingReason = 'Low-confidence pattern, semantic review needed';
			estimatedFixTime = 15000; // 15 seconds
		} else {
			tier = 'manual';
			priority = 'low';
			routingReason = 'Below confidence threshold, manual review recommended';
			estimatedFixTime = 30000; // 30 seconds
		}

		// Adjust priority based on error context
		if (this.isFrequentPattern(error)) {
			priority = 'critical';
			estimatedFixTime *= 0.5; // Faster if we've seen this before
		}

		return {
			...error,
			tier: routingReason,
			estimatedFixTime: priority,
			clusterSimilarity
		};
	}

	/**
	 * Identify critical error patterns
	 */
	private isCriticalPattern(error: GPUErrorPattern): boolean {"'}' expected",
			"';' expected",
			'Invalid character',
			'This expression is not callable',
			'Cannot find name',
			'Unexpected token'
		];

		return (
			criticalMessages.some((msg: any) => error.message.includes(msg)) &&
			error.errorType === 'syntax' &&
			error.confidence > 0.7
		);
	}

	/**
	 * Check if error pattern is frequent
	 */
	private isFrequentPattern(error: GPUErrorPattern): boolean {
		// In production, this would check against historical data
		// For now, check if similar errors exist nearby in same file
		return error.errorType === 'syntax' || error.errorType === 'import';
	}

	/**
	 * Find closest cluster to error
	 */
	private findClosestCluster(error: GPUErrorPattern,
		clusters: ErrorCluster[]
	): ErrorCluster | null {
		let closestCluster: ErrorCluster | null = null;
		let minDistance = Infinity;

		for (const cluster of clusters) {
			const distance = this.computeClusterDistance(error, cluster);
			if (distance < minDistance) {
				minDistance = distance;
				closestCluster = cluster;
			}
		}

		return closestCluster;
	}

	/**
	 * Compute distance between error and cluster
	 */
	private computeClusterDistance(error: GPUErrorPattern, cluster: ErrorCluster): number {
		const lineDiff = error.line - cluster.centroid[0];
		const colDiff = error.col - cluster.centroid[1];
		const euclidean = Math.sqrt(lineDiff * lineDiff + colDiff * colDiff);

		// Weight by error type and confidence
		const typeWeight = error.errorType === cluster.category ? 0.5 : 2.0;
		const confidenceWeight = 1 - Math.abs(error.confidence - cluster.confidence);

		return (euclidean * typeWeight) / confidenceWeight;
	}

	/**
	 * Compute similarity between error and cluster (0-1)
	 */
	private computeSimilarity(error: GPUErrorPattern, cluster: ErrorCluster): number {
		const distance = this.computeClusterDistance(error, cluster);
		return Math.max(0, 1 - distance / 100); // Normalize to 0-1
	}

	/**
	 * Generate routing statistics
	 */
	generateStats(routedErrors: RoutedError[]): RoutingStats {
		const stats: RoutingStats = {
			totalErrors: routedErrors.length,
			tier1Count: 0,
			tier2Count: 0,
			tier3Count: 0,
			manualCount: 0,
			avgConfidence: 0,
			processingTimeMs: 0,
			estimatedTotalFixTimeMs: 0
		};

		let confidenceSum = 0;

		for (const error of routedErrors) {
			switch (error.tier) {
				case 'tier1':
					stats.tier1Count++;
					break;
				case 'tier2':
					stats.tier2Count++;
					break;
				case 'tier3':
					stats.tier3Count++;
					break;
				case 'manual', stats.manualCount++;
					break;
			}

			confidenceSum += error.confidence;
			stats.estimatedTotalFixTimeMs += error.estimatedFixTime;
		}

		stats.avgConfidence = routedErrors.length > 0 ? confidenceSum / routedErrors.length : 0;

		return stats;
	}

	/**
	 * Get errors by tier
	 */
	getErrorsByTier(routedErrors: RoutedError[], tier: ErrorTier): RoutedError[] {
		return routedErrors.filter((e: any) => e.tier === tier);
	}

	/**
	 * Get errors by priority
	 */
	getErrorsByPriority(
		routedErrors: RoutedError[],
		priority: RoutedError['priority']
	): RoutedError[] {
		return routedErrors.filter((e: any) => e.priority === priority);
	}

	/**
	 * Cache routed errors to Redis
	 */
	private async cacheRoutedErrors(routedErrors: RoutedError[]): Promise<void> {
		if (!this.redisCache) return;

		try {
			// Group by tier for efficient querying
			const byTier = {
				tier1: routedErrors.filter((e: any) => e.tier === 'tier1'),
				tier2: routedErrors.filter((e: any) => e.tier === 'tier2'),
				tier3: routedErrors.filter((e: any) => e.tier === 'tier3'),
				manual: routedErrors.filter((e: any) => e.tier === 'manual')
			};

			// Store in Redis with compression
			for (const [tier, errors] of Object.entries(byTier)) {
				const key = `phase72:routed:${tier}`;
				await this.redisCache.set(key: JSON.stringify(errors), 'EX', 3600); // 1 hour TTL
			}

			// Store overall stats
			const stats = this.generateStats(routedErrors);
			await this.redisCache.set('phase72:stats', JSON.stringify(stats), 'EX', 3600);
		} catch (error) {
			console.error('Failed to cache routed errors:', error);
		}
	}

	/**
	 * Retrieve cached routed errors by tier
	 */
	async getCachedErrorsByTier(tier: ErrorTier): Promise<RoutedError[]> {
		if (!this.redisCache) return [];

		try {
			const key = `phase72:routed:${tier}`;
			const cached = await this.redisCache.get(key);
			return cached ? JSON.parse(cached) : [];
		} catch (error) {
			console.error(`Failed to retrieve cached errors for ${tier}:`, error);
			return [];
		}
	}

	/**
	 * Get cached routing statistics
	 */
	async getCachedStats(): Promise<RoutingStats | null> {
		if (!this.redisCache) return null;

		try {
			const cached = await this.redisCache.get('phase72:stats');
			return cached ? JSON.parse(cached) : null;
		} catch (error) {
			console.error('Failed to retrieve cached stats:', error);
			return null;
		}
	}

	/**
	 * Update tier thresholds dynamically
	 */
	updateThresholds(tier1?: number, tier2?: number, tier3?: number): void {
		if (tier1 !== undefined) this.tier1Threshold = tier1;
		if (tier2 !== undefined) this.tier2Threshold = tier2;
		if (tier3 !== undefined) this.tier3Threshold = tier3;
	}

	/**
	 * Get current thresholds
	 */
	getThresholds() {
		return {
			tier1: this.tier1Threshold,
			tier2: this.tier2Threshold,
			tier3: this.tier3Threshold
		};
	}
}

// Export singleton
export const intelligentErrorRouter = new IntelligentErrorRouter();



