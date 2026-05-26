import { Redis } from 'ioredis';
import { db } from '$lib/server/db/client.js';
import { retrievalCacheTraces } from '$lib/server/db/schema/documents-atlas.js';

// Assuming standard env vars for redis
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const redis = new Redis(redisUrl);

export type CacheLayer = 
  | 'redis_exact'
  | 'redis_semantic'
  | 'qdrant'
  | 'postgres'
  | 'graph'
  | 'fallback';

export type CacheTraceContext = {
  runId: string;
  queryHash: string;
  packetId?: string;
  cacheHit: boolean;
  cacheLayerUsed: CacheLayer;
  hits?: any[];
  selected?: any[];
  tokenEstimate?: number;
  toonBytes?: number;
  bifrostModelId?: string;
  latencyMs: number;
  traceDetails?: Record<string, any>;
};

export class CacheLogger {
  /**
   * Logs a cache trace to both Redis (bounded list for fast analytics)
   * and Postgres (async write for durable persistence).
   */
  static async logTrace(ctx: CacheTraceContext) {
    const traceRecord = {
      runId: ctx.runId,
      queryHash: ctx.queryHash,
      packetId: ctx.packetId,
      cacheHit: ctx.cacheHit,
      cacheLayerUsed: ctx.cacheLayerUsed,
      hits: ctx.hits ?? [],
      selected: ctx.selected ?? [],
      tokenEstimate: ctx.tokenEstimate,
      toonBytes: ctx.toonBytes,
      bifrostModelId: ctx.bifrostModelId,
      latencyMs: ctx.latencyMs,
      traceDetails: ctx.traceDetails ?? {},
      createdAt: new Date().toISOString()
    };

    // 1. Redis bounded list logging
    try {
      const traceKey = 'obs:cache-trace:recent';
      const pipe = redis.pipeline();
      pipe.lpush(traceKey, JSON.stringify(traceRecord));
      pipe.ltrim(traceKey, 0, 9999);
      pipe.expire(traceKey, 604800); // 7 days TTL
      await pipe.exec();
    } catch (err) {
      console.error('[CacheLogger] Failed to write to Redis:', err);
    }

    // 2. Postgres async write
    // Fire and forget so we don't block inference
    db.insert(retrievalCacheTraces).values({
      runId: ctx.runId,
      queryHash: ctx.queryHash,
      packetId: ctx.packetId,
      hits: ctx.hits ?? [],
      selected: ctx.selected ?? [],
      tokenEstimate: ctx.tokenEstimate,
      toonBytes: ctx.toonBytes,
      bifrostModelId: ctx.bifrostModelId,
      latencyMs: ctx.latencyMs,
      metadata: { 
        cacheHit: ctx.cacheHit,
        cacheLayerUsed: ctx.cacheLayerUsed,
        traceDetails: ctx.traceDetails ?? {}
      },
      createdAt: new Date()
    }).catch(err => {
      console.error('[CacheLogger] Failed async write to Postgres:', err);
    });
  }
}
