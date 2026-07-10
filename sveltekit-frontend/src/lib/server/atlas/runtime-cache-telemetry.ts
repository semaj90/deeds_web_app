/**
 * Runtime-Cache Telemetry
 *
 * Tracks cache hits, misses, LOD emissions, promotion routing.
 * Exports metrics for Grafana dashboards.
 */

import Redis from 'ioredis';

export interface CacheTelemetry {
  browser_cache_hits: number;
  browser_cache_misses: number;
  valkey_hot_hits: number;
  valkey_hot_misses: number;
  valkey_warm_hits: number;
  valkey_warm_misses: number;
  som_exact_hits: number;
  som_neighbor_searches: number;
  promotion_destinations: {
    [key: string]: number;
  };
  lod_emissions: {
    [lod: string]: number;
  };
  validation_gates: {
    passed: number;
    failed: number;
  };
  latency: {
    avg_exact_hit_ms: number;
    avg_radius_search_ms: number;
    avg_network_fetch_ms: number;
  };
}

class RuntimeCacheTelemetryCollector {
  private redis: Redis;
  private metricsPrefix = 'runtime-cache:telemetry';

  constructor(redisClient?: Redis) {
    this.redis = redisClient || new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: () => null
    });
  }

  async initialize() {
    if (!this.redis.isOpen) {
      await this.redis.connect().catch(() => {});
    }
  }

  async recordCacheHit(cacheLayer: 'browser-l1' | 'valkey-hot' | 'valkey-warm', latencyMs: number) {
    try {
      const key = `${this.metricsPrefix}:${cacheLayer}:hits`;
      await this.redis.incr(key);
      await this.redis.expire(key, 86400); // 24h retention
      await this.recordLatency(cacheLayer, latencyMs);
      this.logTelemetry(`[CACHE_HIT] ${cacheLayer} (${latencyMs}ms)`);
    } catch (err) {
      console.warn('Failed to record cache hit telemetry:', err);
    }
  }

  async recordCacheMiss(cacheLayer: string) {
    try {
      const key = `${this.metricsPrefix}:${cacheLayer}:misses`;
      await this.redis.incr(key);
      await this.redis.expire(key, 86400);
      this.logTelemetry(`[CACHE_MISS] ${cacheLayer}`);
    } catch (err) {
      console.warn('Failed to record cache miss telemetry:', err);
    }
  }

  async recordSomLookup(isExact: boolean, latencyMs: number) {
    try {
      const key = isExact ? `${this.metricsPrefix}:som:exact_hits` : `${this.metricsPrefix}:som:neighbor_searches`;
      await this.redis.incr(key);
      await this.redis.expire(key, 86400);
      this.logTelemetry(`[SOM_LOOKUP] ${isExact ? 'exact' : 'neighbor'} (${latencyMs}ms)`);
    } catch (err) {
      console.warn('Failed to record SOM lookup telemetry:', err);
    }
  }

  async recordPromotion(destination: string) {
    try {
      const key = `${this.metricsPrefix}:promotion:${destination}`;
      await this.redis.incr(key);
      await this.redis.expire(key, 86400);
      this.logTelemetry(`[PROMOTION] destination=${destination}`);
    } catch (err) {
      console.warn('Failed to record promotion telemetry:', err);
    }
  }

  async recordLodEmission(lod: string) {
    try {
      const key = `${this.metricsPrefix}:lod:${lod}`;
      await this.redis.incr(key);
      await this.redis.expire(key, 86400);
      this.logTelemetry(`[LOD_EMISSION] level=${lod}`);
    } catch (err) {
      console.warn('Failed to record LOD emission telemetry:', err);
    }
  }

  async recordValidationGate(passed: boolean) {
    try {
      const key = passed ? `${this.metricsPrefix}:validation:passed` : `${this.metricsPrefix}:validation:failed`;
      await this.redis.incr(key);
      await this.redis.expire(key, 86400);
      this.logTelemetry(`[VALIDATION] ${passed ? 'passed' : 'failed'}`);
    } catch (err) {
      console.warn('Failed to record validation telemetry:', err);
    }
  }

  private async recordLatency(cacheLayer: string, latencyMs: number) {
    try {
      const key = `${this.metricsPrefix}:latency:${cacheLayer}`;
      const current = await this.redis.get(key);
      const parsed = current ? JSON.parse(current) : { count: 0, sum: 0 };
      parsed.count += 1;
      parsed.sum += latencyMs;
      await this.redis.set(key, JSON.stringify(parsed), 'EX', 86400);
    } catch (err) {
      console.warn('Failed to record latency telemetry:', err);
    }
  }

  async getMetrics(): Promise<CacheTelemetry | null> {
    try {
      const keys = await this.redis.keys(`${this.metricsPrefix}:*`);
      const metrics: CacheTelemetry = {
        browser_cache_hits: 0,
        browser_cache_misses: 0,
        valkey_hot_hits: 0,
        valkey_hot_misses: 0,
        valkey_warm_hits: 0,
        valkey_warm_misses: 0,
        som_exact_hits: 0,
        som_neighbor_searches: 0,
        promotion_destinations: {},
        lod_emissions: {},
        validation_gates: { passed: 0, failed: 0 },
        latency: {
          avg_exact_hit_ms: 0,
          avg_radius_search_ms: 0,
          avg_network_fetch_ms: 0
        }
      };

      for (const key of keys) {
        const value = await this.redis.get(key);
        if (!value) continue;

        if (key.includes('browser-l1:hits')) metrics.browser_cache_hits = parseInt(value, 10);
        if (key.includes('browser-l1:misses')) metrics.browser_cache_misses = parseInt(value, 10);
        if (key.includes('valkey-hot:hits')) metrics.valkey_hot_hits = parseInt(value, 10);
        if (key.includes('valkey-hot:misses')) metrics.valkey_hot_misses = parseInt(value, 10);
        if (key.includes('valkey-warm:hits')) metrics.valkey_warm_hits = parseInt(value, 10);
        if (key.includes('valkey-warm:misses')) metrics.valkey_warm_misses = parseInt(value, 10);
        if (key.includes('som:exact_hits')) metrics.som_exact_hits = parseInt(value, 10);
        if (key.includes('som:neighbor_searches')) metrics.som_neighbor_searches = parseInt(value, 10);
        if (key.includes('promotion:')) {
          const dest = key.split(':').pop();
          if (dest) metrics.promotion_destinations[dest] = parseInt(value, 10);
        }
        if (key.includes('lod:')) {
          const lod = key.split(':').pop();
          if (lod) metrics.lod_emissions[lod] = parseInt(value, 10);
        }
        if (key.includes('validation:passed')) metrics.validation_gates.passed = parseInt(value, 10);
        if (key.includes('validation:failed')) metrics.validation_gates.failed = parseInt(value, 10);
      }

      return metrics;
    } catch (err) {
      console.warn('Failed to fetch telemetry metrics:', err);
      return null;
    }
  }

  private logTelemetry(message: string) {
    console.log(`[TELEMETRY] ${message}`);
  }

  async shutdown() {
    if (this.redis.isOpen) {
      await this.redis.quit().catch(() => {});
    }
  }
}

// Global singleton
let telemetryInstance: RuntimeCacheTelemetryCollector | null = null;

export function getTelemetryCollector(): RuntimeCacheTelemetryCollector {
  if (!telemetryInstance) {
    telemetryInstance = new RuntimeCacheTelemetryCollector();
  }
  return telemetryInstance;
}

export async function initializeTelemetry() {
  const collector = getTelemetryCollector();
  await collector.initialize();
  return collector;
}
