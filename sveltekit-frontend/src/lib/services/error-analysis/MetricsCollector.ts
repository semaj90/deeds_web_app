/**
 * Metrics Collector for LLM Self-Improvement System
 * Phase 72 - Task 15: Monitoring and Observability
 */

import type { SystemMetrics } from './types.js';
import { getCacheService } from './CacheService.js';
import { getDecisionEngine } from './DecisionEngine.js';
import { getEscalationService } from './EscalationService.js';
import { getLearningPipeline } from './LearningPipeline.js';
import { getGRPOPolicy } from './GRPOPolicy.js';
import { getExperienceRecorder } from './ExperienceRecorder.js';

export interface MetricsConfig {
	collectionIntervalMs: number;
	retentionPeriodMs: number;
	enableServiceHealthChecks: boolean;
}

export interface MetricPoint {
	timestamp: number;
	value: number;
}

export interface MetricsSnapshot {
	timestamp: Date;
	metrics: SystemMetrics;
	history: {
		errorDetectionRate: MetricPoint[];
		cacheHitRate: MetricPoint[];
		fixSuccessRate: MetricPoint[];
		escalationRate: MetricPoint[];
	};
}

/**
 * Metrics Collector Service
 */
export class MetricsCollector {
	private config: MetricsConfig;
	private history: {
		errorDetectionRate: MetricPoint[];
		cacheHitRate: MetricPoint[];
		fixSuccessRate: MetricPoint[];
		escalationRate: MetricPoint[];
	};
	private collectionTimer: NodeJS.Timeout | null = null;
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
			collectionIntervalMs: config?.collectionIntervalMs ?? 60000,
			retentionPeriodMs: config?.retentionPeriodMs ?? 24 * 60 * 60 * 1000,
			enableServiceHealthChecks: config?.enableServiceHealthChecks ?? true
		};
		this.history = {
			errorDetectionRate: [],
			cacheHitRate: [],
			fixSuccessRate: [],
			escalationRate: []
		};
	}

	start(): void {
		if (this.collectionTimer) return;
		this.collectionTimer = setInterval(() => {
			this.collectMetrics();
		}, this.config.collectionIntervalMs);
		this.collectMetrics();
	}

	stop(): void {
		if (this.collectionTimer) {
			clearInterval(this.collectionTimer);
			this.collectionTimer = null;
		}
	}

	private collectMetrics(): void {
		const now = Date.now();
		this.lastCollection = new Date();

		const decisionStats = getDecisionEngine().getStats();
		const _escalationStats = getEscalationService().getStats();
		const _pipelineStats = getLearningPipeline().getStats();
		const experienceStats = getExperienceRecorder().getStats();

		const errorDetectionRate = experienceStats.totalExperiences > 0 ? 1 : 0;
		const cacheHitRate = this.getCacheHitRate();
		const fixSuccessRate = decisionStats.successRate;
		const escalationRate = decisionStats.escalationRate;

		this.addToHistory('errorDetectionRate', now, errorDetectionRate);
		this.addToHistory('cacheHitRate', now, cacheHitRate);
		this.addToHistory('fixSuccessRate', now, fixSuccessRate);
		this.addToHistory('escalationRate', now, escalationRate);

		this.pruneHistory();
	}

	private addToHistory(
		metric: keyof typeof this.history,
		timestamp: number,
		value: number
	): void {
		this.history[metric].push({ timestamp, value });
	}

	private pruneHistory(): void {
		const cutoff = Date.now() - this.config.retentionPeriodMs;
		for (const key of Object.keys(this.history) as (keyof typeof this.history)[]) {
			this.history[key] = this.history[key].filter((p: any) => p.timestamp > cutoff);
		}
	}

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

	async checkServiceHealth(): Promise<{
		redis: boolean;
		qdrant: boolean;
		neo4j: boolean;
		ollama: boolean;
	}> {
		const health = { redis: false, qdrant: false, neo4j: false, ollama: false };
		if (!this.config.enableServiceHealthChecks) return health;

		try {
			const cache = getCacheService();
			health.redis = await cache.isConnected();
		} catch { health.redis = false; }

		try {
			const response = await fetch('http://localhost:6333/health', { signal: AbortSignal.timeout(2000) });
			health.qdrant = response.ok;
		} catch { health.qdrant = false; }

		try {
			const response = await fetch('http://localhost:7474', { signal: AbortSignal.timeout(2000) });
			health.neo4j = response.ok;
		} catch { health.neo4j = false; }

		try {
			const response = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2000) });
			health.ollama = response.ok;
		} catch { health.ollama = false; }

		return health;
	}

	recordPerformance(
		metric: 'embeddingGenerationTime' | 'vectorSearchLatency' | 'fixApplicationTime' | 'policyUpdateTime',
		durationMs: number
	): void {
		const n = this.performanceMetrics.sampleCount + 1;
		this.performanceMetrics[metric] =
			(this.performanceMetrics[metric] * this.performanceMetrics.sampleCount + durationMs) / n;
		this.performanceMetrics.sampleCount = n;
	}

	async getSnapshot(): Promise<MetricsSnapshot> {
		const decisionStats = getDecisionEngine().getStats();
		const _escalationStats = getEscalationService().getStats();
		const _policyStats = getGRPOPolicy().getStats();
		const pipelineStatus = getLearningPipeline().getStatus();
		const serviceHealth = await this.checkServiceHealth();

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
			errorDetectionRate: this.getLatestValue('errorDetectionRate'),
			cacheHitRate: this.getLatestValue('cacheHitRate'),
			confidenceDistribution: {
				high: highConfidence / total,
				medium: mediumConfidence / total,
				low: lowConfidence / total
			},
			fixSuccessRate: decisionStats.successRate,
			escalationRate: decisionStats.escalationRate,
			policyUpdateFrequency: pipelineStatus.totalUpdates,
			serviceAvailability: serviceHealth,
			performance: {
				embeddingGenerationTime: this.performanceMetrics.embeddingGenerationTime,
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

	private getLatestValue(metric: keyof typeof this.history): number {
		const points = this.history[metric];
		return points.length > 0 ? points[points.length - 1].value : 0;
	}

	getSummary() {
		return {
			lastCollection: this.lastCollection,
			historySize: {
				errorDetectionRate: this.history.errorDetectionRate.length,
				cacheHitRate: this.history.cacheHitRate.length,
				fixSuccessRate: this.history.fixSuccessRate.length,
				escalationRate: this.history.escalationRate.length
			},
			performance: this.performanceMetrics
		};
	}

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
let metricsCollectorInstance: MetricsCollector | null = null;

/**
 * Get or create MetricsCollector singleton
 */
export function getMetricsCollector(config?: Partial<MetricsConfig>): MetricsCollector {
	if (!metricsCollectorInstance) {
		metricsCollectorInstance = new MetricsCollector(config);
	}
	return metricsCollectorInstance;
}