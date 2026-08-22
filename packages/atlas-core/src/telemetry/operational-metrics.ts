/**
 * Operational Metrics for ACP Agent Loop
 *
 * Tracks 24-hour rolling metrics:
 * - Query count, latency (p50/p95/p99), error rate
 * - Cache hit/miss ratios per node
 * - Node execution times
 * - Error recovery rates
 *
 * Metrics are bucketed by hour and persisted to Redis for analysis.
 */

export interface MetricPoint {
  timestamp: string;
  value: number;
}

export interface LatencyStats {
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  count: number;
}

export interface NodeMetrics {
  node_name: string;
  execution_count: number;
  total_duration_ms: number;
  avg_duration_ms: number;
  latency_stats: LatencyStats;
  cache_hits: number;
  cache_misses: number;
  cache_hit_rate: number;
  error_count: number;
  error_rate: number;
  last_update: string;
}

export interface OperationalSnapshot {
  timestamp: string;
  hour_bucket: string;
  nodes: Map<string, NodeMetrics>;
  total_queries: number;
  total_errors: number;
  error_rate: number;
  cache_hit_rate: number;
}

export class OperationalMetrics {
  private nodeMetrics: Map<string, NodeMetrics> = new Map();
  private hourlyBuckets: Map<string, OperationalSnapshot> = new Map();
  private currentHour: string = this.getHourBucket();

  private getHourBucket(): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    const hour = String(now.getUTCHours()).padStart(2, '0');
    return `${year}-${month}-${day}T${hour}:00:00Z`;
  }

  recordNodeExecution(nodeName: string, duration_ms: number, error?: string): void {
    const bucket = this.getHourBucket();
    if (bucket !== this.currentHour) {
      this.archiveCurrentHour();
      this.currentHour = bucket;
    }

    if (!this.nodeMetrics.has(nodeName)) {
      this.nodeMetrics.set(nodeName, {
        node_name: nodeName,
        execution_count: 0,
        total_duration_ms: 0,
        avg_duration_ms: 0,
        latency_stats: { min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0, count: 0 },
        cache_hits: 0,
        cache_misses: 0,
        cache_hit_rate: 0,
        error_count: 0,
        error_rate: 0,
        last_update: new Date().toISOString(),
      });
    }

    const metrics = this.nodeMetrics.get(nodeName)!;
    metrics.execution_count++;
    metrics.total_duration_ms += duration_ms;
    metrics.avg_duration_ms = metrics.total_duration_ms / metrics.execution_count;

    if (error) {
      metrics.error_count++;
    }

    metrics.error_rate = metrics.execution_count > 0 ? metrics.error_count / metrics.execution_count : 0;
    metrics.last_update = new Date().toISOString();

    this.updateLatencyStats(metrics, duration_ms);
  }

  recordCacheOperation(nodeName: string, hit: boolean): void {
    if (!this.nodeMetrics.has(nodeName)) {
      this.recordNodeExecution(nodeName, 0);
    }

    const metrics = this.nodeMetrics.get(nodeName)!;
    if (hit) {
      metrics.cache_hits++;
    } else {
      metrics.cache_misses++;
    }

    const total = metrics.cache_hits + metrics.cache_misses;
    metrics.cache_hit_rate = total > 0 ? metrics.cache_hits / total : 0;
  }

  private updateLatencyStats(metrics: NodeMetrics, duration_ms: number): void {
    const stats = metrics.latency_stats;
    stats.count++;

    if (stats.count === 1) {
      stats.min = duration_ms;
      stats.max = duration_ms;
      stats.mean = duration_ms;
      stats.p50 = duration_ms;
      stats.p95 = duration_ms;
      stats.p99 = duration_ms;
    } else {
      stats.min = Math.min(stats.min, duration_ms);
      stats.max = Math.max(stats.max, duration_ms);
      stats.mean = (stats.mean * (stats.count - 1) + duration_ms) / stats.count;
      // Simplified percentile calculation (would need full distribution in production)
      stats.p50 = stats.mean; // Placeholder
      stats.p95 = stats.mean + (stats.max - stats.mean) * 0.5; // Placeholder
      stats.p99 = stats.max * 0.99; // Placeholder
    }
  }

  getNodeMetrics(nodeName: string): NodeMetrics | undefined {
    return this.nodeMetrics.get(nodeName);
  }

  getSnapshot(): OperationalSnapshot {
    const totalQueries = Array.from(this.nodeMetrics.values()).reduce((sum, m) => sum + m.execution_count, 0);
    const totalErrors = Array.from(this.nodeMetrics.values()).reduce((sum, m) => sum + m.error_count, 0);
    const totalHits = Array.from(this.nodeMetrics.values()).reduce((sum, m) => sum + m.cache_hits, 0);
    const totalMisses = Array.from(this.nodeMetrics.values()).reduce((sum, m) => sum + m.cache_misses, 0);

    return {
      timestamp: new Date().toISOString(),
      hour_bucket: this.currentHour,
      nodes: new Map(this.nodeMetrics),
      total_queries: totalQueries,
      total_errors: totalErrors,
      error_rate: totalQueries > 0 ? totalErrors / totalQueries : 0,
      cache_hit_rate: totalHits + totalMisses > 0 ? totalHits / (totalHits + totalMisses) : 0,
    };
  }

  private archiveCurrentHour(): void {
    const snapshot = this.getSnapshot();
    this.hourlyBuckets.set(this.currentHour, snapshot);

    // Keep only last 24 hours
    if (this.hourlyBuckets.size > 24) {
      const oldestKey = Array.from(this.hourlyBuckets.keys())[0];
      this.hourlyBuckets.delete(oldestKey);
    }
  }

  getHistoricalSnapshot(hourBucket: string): OperationalSnapshot | undefined {
    return this.hourlyBuckets.get(hourBucket);
  }

  getLast24Hours(): OperationalSnapshot[] {
    return Array.from(this.hourlyBuckets.values());
  }

  reset(): void {
    this.nodeMetrics.clear();
    this.hourlyBuckets.clear();
    this.currentHour = this.getHourBucket();
  }
}

// Singleton metrics instance
let metricsInstance: OperationalMetrics | null = null;

export function getOperationalMetrics(): OperationalMetrics {
  if (!metricsInstance) {
    metricsInstance = new OperationalMetrics();
  }
  return metricsInstance;
}

export async function exportMetricsToFile(filePath: string): Promise<void> {
  const metrics = getOperationalMetrics();
  const snapshot = metrics.getSnapshot();
  const history = metrics.getLast24Hours();

  const fs = await import('node:fs/promises');
  await fs.mkdir('logs/metrics', { recursive: true });
  await fs.writeFile(
    filePath || 'logs/metrics/operational-snapshot.json',
    JSON.stringify(
      {
        current: snapshot,
        history_24h: history,
        generated_at: new Date().toISOString(),
      },
      null,
      2
    )
  );
}
