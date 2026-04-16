/**
 * Redis-backed sliding window rate limiter.
 *
 * Uses Redis INCR + EXPIRE for atomic counters — works across multiple
 * SvelteKit workers/instances with shared state.
 *
 * Falls back to in-memory Map if Redis is unavailable.
 */

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (request: Request) => string;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// ── In-memory fallback ──────────────────────────────────────────────────
const FALLBACK_MAX_ENTRIES = 50_000;

class RateLimiter {
  private limits = new Map<string, RateLimitEntry>();
  private config: RateLimitConfig;
  private redisAvailable = false;
  private redisClient: import('ioredis').Redis | null = null;

  constructor(config: RateLimitConfig) {
    this.config = config;
    // Clean up expired entries periodically (in-memory fallback)
    setInterval(() => {
      this.cleanup();
    }, this.config.windowMs);
    // Lazy-init Redis
    this.initRedis();
  }

  private async initRedis(): Promise<void> {
    try {
      const { getRedis } = await import('$lib/server/redis.js');
      this.redisClient = getRedis();
      this.redisAvailable = true;
    } catch {
      // Redis not available — stick with in-memory
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.limits.entries()) {
      if (now > entry.resetTime) {
        this.limits.delete(key);
      }
    }
  }

  private getKey(request: Request): string {
    if (this.config.keyGenerator) {
      return this.config.keyGenerator(request);
    }
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0] : 'unknown';
    return ip;
  }

  private checkInMemory(key: string): { allowed: boolean; resetTime: number; remaining: number } {
    const now = Date.now();
    const resetTime = now + this.config.windowMs;
    const entry = this.limits.get(key);

    if (!entry || now > entry.resetTime) {
      if (!this.limits.has(key) && this.limits.size >= FALLBACK_MAX_ENTRIES) {
        const oldest = this.limits.keys().next().value;
        if (oldest) this.limits.delete(oldest);
      }
      this.limits.set(key, { count: 1, resetTime });
      return { allowed: true, remaining: this.config.maxRequests - 1, resetTime };
    }

    if (entry.count >= this.config.maxRequests) {
      return { allowed: false, resetTime: entry.resetTime, remaining: 0 };
    }

    entry.count++;
    return {
      allowed: true,
      resetTime: entry.resetTime,
      remaining: this.config.maxRequests - entry.count,
    };
  }

  check(request: Request): { allowed: boolean; resetTime: number; remaining: number } {
    const key = this.getKey(request);
    // Sync check always uses in-memory (keeps existing sync API stable)
    return this.checkInMemory(key);
  }

  /**
   * Redis-backed async check. Falls back to in-memory if Redis unavailable.
   */
  async checkAsync(
    request: Request
  ): Promise<{ allowed: boolean; resetTime: number; remaining: number }> {
    const key = this.getKey(request);

    if (!this.redisClient || !this.redisAvailable) {
      return this.checkInMemory(key);
    }

    const redisKey = `rl:${key}`;
    const windowSec = Math.ceil(this.config.windowMs / 1000);

    try {
      const count = await this.redisClient.incr(redisKey);
      if (count === 1) {
        await this.redisClient.expire(redisKey, windowSec);
      }

      if (count > this.config.maxRequests) {
        const ttl = await this.redisClient.ttl(redisKey);
        const retryMs = (ttl > 0 ? ttl : windowSec) * 1000;
        return { allowed: false, remaining: 0, resetTime: Date.now() + retryMs };
      }

      return {
        allowed: true,
        remaining: this.config.maxRequests - count,
        resetTime: Date.now() + windowSec * 1000,
      };
    } catch {
      // Redis transient error — fall back
      return this.checkInMemory(key);
    }
  }
}

// Create rate limiters for different endpoints
export const chatRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  keyGenerator: (request) => {
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0] : 'unknown';
    const authHeader = request.headers.get('authorization');
    const userKey = authHeader ? authHeader.slice(0, 10) : 'anon';
    return `chat:${ip}:${userKey}`;
  },
});

export const embedRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
});

export const heavyRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 10,
});

// ── Hooks-level rate limiting (tiered, replaces inline Map in hooks.server.ts) ──

/** Route-specific rate limit tiers — matched in order, first match wins */
export const RATE_TIERS: Array<{
  prefix: string;
  window: number;
  max: number;
  methods?: string[];
}> = [
  { prefix: '/api/auth/login', window: 300_000, max: 10 },
  { prefix: '/api/auth/register', window: 300_000, max: 5 },
  { prefix: '/api/auth/reset-password', window: 300_000, max: 5 },
  { prefix: '/api/ai/tensorrt', window: 60_000, max: 10 },
  { prefix: '/api/gpu/', window: 60_000, max: 15 },
  { prefix: '/api/ai/', window: 60_000, max: 30 },
  { prefix: '/api/rag/', window: 60_000, max: 30 },
  { prefix: '/api/synthesis/', window: 60_000, max: 20 },
  { prefix: '/api/agents/', window: 60_000, max: 20 },
  { prefix: '/api/contextual/', window: 60_000, max: 30 },
  { prefix: '/api/chat/', window: 60_000, max: 40 },
  { prefix: '/api/sse/', window: 60_000, max: 40 },
  { prefix: '/api/', window: 60_000, max: 60, methods: ['POST', 'PUT', 'PATCH', 'DELETE'] },
  { prefix: '/api/', window: 60_000, max: 200, methods: ['GET'] },
];

export function getRateTier(path: string, method: string) {
  for (const tier of RATE_TIERS) {
    if (path.startsWith(tier.prefix)) {
      if (!tier.methods || tier.methods.includes(method)) return tier;
    }
  }
  return null;
}

import { checkRedisRateLimit, evictFallback } from '$lib/server/rate-limit/redis-rate-limit.js';

/**
 * Check hooks-level rate limit (called from hooks.server.ts handle function).
 * Returns null if no tier matches (no limiting applied).
 * Delegates Redis + fallback logic to the rate-limit module.
 */
export async function checkHooksRateLimit(
  path: string,
  method: string,
  ip: string
): Promise<{ allowed: boolean; remaining: number; limit: number; retryAfter: number } | null> {
  const tier = getRateTier(path, method);
  if (!tier) return null;

  const result = await checkRedisRateLimit({
    bucket: tier.prefix,
    identifier: ip,
    max: tier.max,
    windowMs: tier.window,
  });

  return {
    allowed: result.allowed,
    remaining: result.remaining,
    limit: result.limit,
    retryAfter: result.retryAfter,
  };
}

/** Start periodic eviction of the in-memory fallback store */
export function startCleanup(): void {
  setInterval(evictFallback, 60_000).unref?.();
}
