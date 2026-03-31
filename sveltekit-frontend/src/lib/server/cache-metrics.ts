/**
 * Cache Observability — Lightweight hit/miss counters per tier and key prefix.
 *
 * Tracks:
 *   - Memory cache hits/misses
 *   - Redis cache hits/misses
 *   - Per-prefix breakdown (retrieval, synthesis, client, evidence, graph, embed)
 *   - Latency percentiles for Redis operations
 *
 * Usage:
 *   import { cacheMetrics } from '$lib/server/cache-metrics.js';
 *   cacheMetrics.recordHit('memory', key);
 *   cacheMetrics.recordMiss('memory', key);
 *   cacheMetrics.snapshot();  // → { memory: { hits, misses, rate }, redis: {...}, byPrefix: {...} }
 */

export type CacheTier = 'memory' | 'redis';

interface TierCounters {
	hits: number;
	misses: number;
}

interface PrefixCounters {
	hits: number;
	misses: number;
}

interface LatencyBucket {
	count: number;
	totalMs: number;
	maxMs: number;
}

// ── Key prefix extraction ────────────────────────────────────────────────

const PREFIX_PATTERNS: [RegExp, string][] = [
	[/^case:\S+:query:\S+:retrieval/, 'retrieval'],
	[/^query:\S+:retrieval/, 'retrieval'],
	[/^case:\S+:query:\S+:llm:/, 'synthesis'],
	[/^query:\S+:llm:/, 'synthesis'],
	[/^user:\S+:case:\S+:view:/, 'client'],
	[/^user:\S+:recent/, 'client'],
	[/^yolo:evidence:/, 'evidence'],
	[/^llm_synthesis:/, 'evidence'],
	[/^evidence:/, 'evidence'],
	[/^graph:/, 'graph'],
	[/^embed:/, 'embed'],
	[/^job:/, 'job'],
	[/^case:version:/, 'version'],
];

function extractPrefix(key: string): string {
	for (const [pattern, prefix] of PREFIX_PATTERNS) {
		if (pattern.test(key)) return prefix;
	}
	return 'other';
}

// ── Metrics Collector ────────────────────────────────────────────────────

class CacheMetrics {
	private tiers: Record<CacheTier, TierCounters> = {
		memory: { hits: 0, misses: 0 },
		redis: { hits: 0, misses: 0 },
	};

	private prefixes = new Map<string, PrefixCounters>();

	private redisLatency: LatencyBucket = { count: 0, totalMs: 0, maxMs: 0 };

	private startedAt = Date.now();

	recordHit(tier: CacheTier, key: string): void {
		this.tiers[tier].hits++;
		const prefix = extractPrefix(key);
		const p = this.prefixes.get(prefix) ?? { hits: 0, misses: 0 };
		p.hits++;
		this.prefixes.set(prefix, p);
	}

	recordMiss(tier: CacheTier, key: string): void {
		this.tiers[tier].misses++;
		const prefix = extractPrefix(key);
		const p = this.prefixes.get(prefix) ?? { hits: 0, misses: 0 };
		p.misses++;
		this.prefixes.set(prefix, p);
	}

	recordRedisLatency(ms: number): void {
		this.redisLatency.count++;
		this.redisLatency.totalMs += ms;
		if (ms > this.redisLatency.maxMs) this.redisLatency.maxMs = ms;
	}

	private hitRate(c: { hits: number; misses: number }): number {
		const total = c.hits + c.misses;
		return total === 0 ? 0 : Math.round((c.hits / total) * 10000) / 100;
	}

	snapshot() {
		const byPrefix: Record<string, { hits: number; misses: number; hitRate: number }> = {};
		for (const [prefix, counters] of this.prefixes) {
			byPrefix[prefix] = {
				...counters,
				hitRate: this.hitRate(counters),
			};
		}

		const memTotal = this.tiers.memory.hits + this.tiers.memory.misses;
		const redisTotal = this.tiers.redis.hits + this.tiers.redis.misses;

		return {
			uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
			memory: {
				...this.tiers.memory,
				total: memTotal,
				hitRate: this.hitRate(this.tiers.memory),
			},
			redis: {
				...this.tiers.redis,
				total: redisTotal,
				hitRate: this.hitRate(this.tiers.redis),
				avgLatencyMs: this.redisLatency.count > 0
					? Math.round(this.redisLatency.totalMs / this.redisLatency.count * 100) / 100
					: 0,
				maxLatencyMs: Math.round(this.redisLatency.maxMs * 100) / 100,
				opCount: this.redisLatency.count,
			},
			byPrefix,
		};
	}

	reset(): void {
		this.tiers.memory = { hits: 0, misses: 0 };
		this.tiers.redis = { hits: 0, misses: 0 };
		this.prefixes.clear();
		this.redisLatency = { count: 0, totalMs: 0, maxMs: 0 };
		this.startedAt = Date.now();
	}
}

export const cacheMetrics = new CacheMetrics();
