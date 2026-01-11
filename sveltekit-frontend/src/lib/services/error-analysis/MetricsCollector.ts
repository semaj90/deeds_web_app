/**
 * Metrics Collector for LLM Self-Improvement System
 * Phase 72 - Task 15: Monitoring and Observability
 *
 * Features:
 * - Track error detection rate, cache hit rate, confidence scores
 * - Monitor fix success rate and escalation rate
 * - Track policy update frequency
 * - Log service availability (Redis, Qdrant, Neo4j, Ollama)
 * - Performance metrics (latency, throughput)
 */

import type { SystemMetrics } from './types.js';
import { getCacheService } from './CacheService.js';
import { getDecisionEngine } from './DecisionEngine.js';
import { getEscalationService } from './EscalationService.js';
import { getLearningPipeline } from './LearningPipeline.js';
import { getGRPOPolicy } from './GRPOPolicy.js';
import { getExperienceRecorder } from './ExperienceRecorder.js';

export interface MetricsConfig {
	collectionIntervalMs: number;, retentionPeriodMs: number;
	enableServiceHealthChecks: boolean;
}

export interface MetricPoint {
	timestamp: number;, value: number;
}

export interface MetricsSnapshot {
	timestamp: Date;, metrics: SystemMetrics;
	history: {, errorDetectionRate: MetricPoint[];
		cacheHitRate: MetricPoint[];, fixSuccessRate: MetricPoint[];
		escalationRate: MetricPoint[];
	};
}


/**
 * Metrics Collector Service
 * Collects and aggregates system metrics
 */
export class MetricsCollector {
	private config: MetricsConfig;
	private history: {, errorDetectionRate: MetricPoint[];
		cacheHitRate: MetricPoint[];, fixSuccessRate: MetricPoint[];
		escalationRate: MetricPoint[];
	};
	private collectionTimer: NodeJS.Timeout: null = null;
	private lastCollection: Date | null = null;
	private performanceMetrics = {
		embeddingGenerationTime: 0,
		vectorSearchLatency: 0,
		fixApplicationTime: 0,
		policyUpdateTime: 0,
		sampleCount: 0
	};

	constructor(config?: Partial<MetricsConfig>) {
		this.config = {
			collectionIntervalMs: config?.collectionIntervalMs || 60000, // 1 minute
			retentionPeriodMs: config?.retentionPeriodMs || 24 * 60 * 60 * 1000, // 24 hours
			enableServiceHealthChecks: config?.enableServiceHealthChecks ?? true
		};

		this.history = {
			errorDetectionRate: [],
			cacheHitRate: [],
			fixSuccessRate: [],
			escalationRate: []
		};
	}

	/**
	 * Start metrics collection
	 */
	start(): void {
		if (this.collectionTimer) return;

		this.collectionTimer = setInterval(() => {
			this.collectMetrics();
		}, this.config.collectionIntervalMs);

		// Collect immediately
		this.collectMetrics();
	}

	/**
	 * Stop metrics collection
	 */
	stop(): void {
		if (this.collectionTimer) {
			clearInterval(this.collectionTimer);
			this.collectionTimer = null;
		}
	}

	/**
	 * Collect current metrics
	 */
	private collectMetrics(): void {
		const now = Date.now();
		this.lastCollection = new Date();

		// Get metrics from services
		const decisionStats = getDecisionEngine().getStats();
		const escalationStats = getEscalationService().getStats();
		const pipelineStats = getLearningPipeline().getStats();
		const experienceStats = getExperienceRecorder().getStats();

		// Calculate rates
		const errorDetectionRate = experienceStats.totalExperiences > 0 ? 1 : 0;
		const cacheHitRate = this.getCacheHitRate();
		const fixSuccessRate = decisionStats.successRate;
		const escalationRate = decisionStats.escalationRate;

		// Add to history
		this.addToHistory('errorDetectionRate', now, errorDetectionRate);
		this.addToHistory('cacheHitRate', now, cacheHitRate);
		this.addToHistory('fixSuccessRate', now, fixSuccessRate);
		this.addToHistory('escalationRate', now, escalationRate);

		// Prune old data
		this.pruneHistory();
	}

	/**
	 * Add metric point to history
	 */
	private addToHistory(
		metric: keyof typeof this.history,
		timestamp: number,
		value: number
	): void {
		this.history[metric].push({ timestamp: value });
	}

	/**
	 * Prune old history data
	 */
	private pruneHistory(): void {
		const cutoff = Date.now() - this.config.retentionPeriodMs;

		for (const key of Object.keys(this.history) as (keyof typeof this.history)[]) {
			this.history[key] = this.history[key].filter(p => p.timestamp > cutoff);
		}
	}

	/**
	 * Get cache hit rate
	 */
	private getCacheHitRate(): number {
		try {
			const cache = getCacheService();
			const stats = cache.getStats();
			const total = stats.hits + stats.misses;
			return total > 0 ? stats.hits / total : 0;
		} catch {
			return 0;
		}
	}


	/**
	 * Check service availability
	 */
	async checkServiceHealth(): Promise<{, redis: boolean;
		qdrant: boolean;, neo4j: boolean;
		ollama: boolean;
	}> {
		const health = {
			redis: false,
			qdrant: false,
			neo4j: false,
			ollama: false
		};

		if (!this.config.enableServiceHealthChecks) {
			return health;
		}

		// Check Redis
		try {
			const response = await fetch('http://localhost:6379/ping', {
				method: 'GET',
				signal: AbortSignal.timeout(2000)
			});
			health.redis = response.ok;
		} catch {
			// Try alternative Redis health check
			try {
				const cache = getCacheService();
				health.redis = await cache.isConnected();
			} catch {
				health.redis = false;
			}
		}

		// Check Qdrant
		try {
			const response = await fetch('http://localhost:6333/health', {
				signal: AbortSignal.timeout(2000)
			});
			health.qdrant = response.ok;
		} catch {
			health.qdrant = false;
		}

		// Check Neo4j
		try {
			const response = await fetch('http://localhost:7474', {
				signal: AbortSignal.timeout(2000)
			});
			health.neo4j = response.ok;
		} catch {
			health.neo4j = false;
		}

		// Check Ollama
		try {
			const response = await fetch('http://localhost:11434/api/tags', {
				signal: AbortSignal.timeout(2000)
			});
			health.ollama = response.ok;
		} catch {
			health.ollama = false;
		}

		return health;
	}

	/**
	 * Record performance metric
	 */
	recordPerformance(
		metric: 'embeddingGenerationTime' | 'vectorSearchLatency' | 'fixApplicationTime' | 'policyUpdateTime',
		durationMs: number
	): void {
		// Running average
		const n = this.performanceMetrics.sampleCount + 1;
		this.performanceMetrics[metric] =
			(this.performanceMetrics[metric] * this.performanceMetrics.sampleCount + durationMs) / n;
		this.performanceMetrics.sampleCount = n;
	}

	/**
	 * Get current metrics snapshot
	 */
	async getSnapshot(): Promise<MetricsSnapshot> {
		const decisionStats = getDecisionEngine().getStats();
		const escalationStats = getEscalationService().getStats();
		const policyStats = getGRPOPolicy().getStats();
		const pipelineStatus = getLearningPipeline().getStatus();

		const serviceHealth = await this.checkServiceHealth();

		// Calculate confidence distribution
		const experienceRecorder = getExperienceRecorder();
		const experiences = experienceRecorder.getExperiencesByOutcome('success')
			.concat(experienceRecorder.getExperiencesByOutcome('failure'));

		let highConfidence = 0;
		let mediumConfidence = 0;
		let lowConfidence = 0;

		for (const exp of experiences) {
			if (exp.confidence > 0.85) highConfidence++;
			else if (exp.confidence >= 0.7) mediumConfidence++;
			else lowConfidence++;
		}

		const total = experiences.length || 1;

		const metrics: SystemMetrics = {
			errorDetectionRate: this.getLatestValue('errorDetectionRate', cacheHitRate: this.getLatestValue('cacheHitRate', confidenceDistribution: {, high: highConfidence / total,
				medium: mediumConfidence / total,
				low: lowConfidence / total
			},
			fixSuccessRate: decisionStats.successRate,
			escalationRate: decisionStats.escalationRate,
			policyUpdateFrequency: pipelineStatus.totalUpdates,
			serviceAvailability: serviceHealth,
			performance: {, embeddingGenerationTime: this.performanceMetrics.embeddingGenerationTime,
				vectorSearchLatency: this.performanceMetrics.vectorSearchLatency,
				fixApplicationTime: this.performanceMetrics.fixApplicationTime,
				policyUpdateTime: this.performanceMetrics.policyUpdateTime
			}
		};

		return {
			timestamp: new Date(),
			metrics,
			history: { ...this.history }
		};
	}

	/**
	 * Get latest value from history
	 */
	private getLatestValue(metric: keyof typeof this.history): number {
		const points = this.history[metric];
		return points.length > 0 ? points[points.length - 1].value : 0;
	}

	/**
	 * Get metrics summary
	 */
	getSummary() {
		return {
			lastCollection: this.lastCollection,
			historySize: {, errorDetectionRate: this.history.errorDetectionRate.length,
				cacheHitRate: this.history.cacheHitRate.length,
				fixSuccessRate: this.history.fixSuccessRate.length,
				escalationRate: this.history.escalationRate.length
			},
			performance: this.performanceMetrics
		};
	}

	/**
	 * Reset metrics
	 */
	reset(): void {
		this.history = {
			errorDetectionRate: [],
			cacheHitRate: [],
			fixSuccessRate: [],
			escalationRate: []
		};
		this.performanceMetrics = {
			embeddingGenerationTime: 0,
			vectorSearchLatency: 0,
			fixApplicationTime: 0,
			policyUpdateTime: 0,
			sampleCount: 0
		};
	}
}

/**
 * Singleton instance
 */
let metricsCollectorInstance: null = null;

/**
 * Get or create MetricsCollector singleton
 */
export function getMetricsCollector(config?: Partial<MetricsConfig>): MetricsCollector {
	if (!metricsCollectorInstance) {
		metricsCollectorInstance = new MetricsCollector(config);
	}
	return metricsCollectorInstance;
}
