/**
 * Bitmap Telemetry Instrumentation
 * Tracks bitmap operation latencies and emits telemetry to Redis
 */

import { getRedis } from '../redis.js';
import { PacketBitmapCache } from '../cache/packet-bitmap.js';

export interface BitmapTelemetry {
  operation: 'setGate' | 'getGates' | 'getReadiness' | 'similarity' | 'traceCoverage';
  packet_count: number;
  duration_ms: number;
  timestamp: string;
  speedup_vs_postgres?: string;
}

export class BitmapTelemetryCollector {
  private redis = getRedis();

  async recordOperation(telemetry: BitmapTelemetry): Promise<void> {
    const key = `telemetry:bitmap:${telemetry.operation}`;

    try {
      await this.redis.hincrby(key, 'count', 1);
      await this.redis.hincrby(key, 'total_ms', telemetry.duration_ms);
      await this.redis.hset(key, 'last_run', telemetry.timestamp);

      if (telemetry.speedup_vs_postgres) {
        await this.redis.hset(key, 'last_speedup', telemetry.speedup_vs_postgres);
      }

      await this.redis.expire(key, 86400); // 24h TTL
    } catch (err) {
      console.warn('[BitmapTelemetry] Recording failed:', err);
    }
  }

  async getStats(operation: string): Promise<Record<string, unknown> | null> {
    try {
      const key = `telemetry:bitmap:${operation}`;
      const stats = await this.redis.hgetall(key);
      return Object.keys(stats).length > 0 ? stats : null;
    } catch (err) {
      console.warn('[BitmapTelemetry] Fetch stats failed:', err);
      return null;
    }
  }

  async compareWithPostgres(bitmap_latency_ms: number): Promise<string> {
    // Baseline: Postgres gate checks take 50-200ms
    const postgresBaseline = 100; // Conservative middle estimate
    if (bitmap_latency_ms === 0) return 'instant';
    const speedup = Math.round(postgresBaseline / bitmap_latency_ms);
    return `${speedup}×`;
  }
}

export async function withBitmapTelemetry<T>(
  operation: 'setGate' | 'getGates' | 'getReadiness' | 'similarity' | 'traceCoverage',
  packet_count: number,
  fn: (bitmap: PacketBitmapCache) => Promise<T>
): Promise<T> {
  const redis = getRedis();
  const bitmap = new PacketBitmapCache(redis);
  const collector = new BitmapTelemetryCollector();

  const startTime = Date.now();
  const result = await fn(bitmap);
  const duration_ms = Date.now() - startTime;

  const speedup = await collector.compareWithPostgres(duration_ms);

  await collector.recordOperation({
    operation,
    packet_count,
    duration_ms,
    timestamp: new Date().toISOString(),
    speedup_vs_postgres: speedup,
  });

  return result;
}
