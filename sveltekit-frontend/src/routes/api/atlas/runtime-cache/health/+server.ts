import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import Redis from 'ioredis';

export const HEAD: RequestHandler = async () => {
  try {
    const redis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      lazyConnect: true,
      enableOfflineQueue: false
    });

    const pong = await Promise.race([
      redis.ping().then(() => true),
      new Promise<false>((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500))
    ]);

    await redis.quit().catch(() => {});

    if (pong) {
      return new Response(null, { status: 200 });
    }
    return new Response(null, { status: 503 });
  } catch {
    return new Response(null, { status: 503 });
  }
};

export const GET: RequestHandler = async () => {
  try {
    const redis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      lazyConnect: true,
      enableOfflineQueue: false
    });

    const start = Date.now();
    await redis.ping();
    const latencyMs = Date.now() - start;

    await redis.quit().catch(() => {});

    return json(
      {
        status: 'ready',
        latency_ms: latencyMs,
        timestamp: new Date().toISOString()
      },
      { status: 200, headers: { 'Cache-Control': 'no-cache, no-store' } }
    );
  } catch (err) {
    return json(
      {
        status: 'unavailable',
        error: err instanceof Error ? err.message : 'Backend unavailable',
        timestamp: new Date().toISOString()
      },
      { status: 503, headers: { 'Cache-Control': 'no-cache, no-store' } }
    );
  }
};
