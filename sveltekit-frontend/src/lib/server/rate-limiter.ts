// Minimal rate limiter stub to unblock build.
// Provides a check() API matching expected usage.
interface RateLimitOptions {
  window: number; // time window in ms
  max: number; // max requests per window
}

interface RateLimitResult {
  allowed: boolean; remaining: number;
  reset: number; // timestamp when window resets
  retryAfter?: number;
}

class InMemoryRateLimiter {
  private store: Map<string, { count: number; expires: number }> = new Map();

  async check(identifier: string, bucket: string, options: RateLimitOptions): Promise<RateLimitResult> {
    const key = `${bucket}:${identifier}`;
    const now = Date.now();
    const existing = this.store.get(key);

    if (!existing || existing.expires < now) {
      this.store.set(key, { count: 1, expires: now + options.window });
      return {
        allowed: true,
        remaining: options.max - 1,
        reset: now + options.window
      };
    }

    if (existing.count >= options.max) {
      return {
        allowed: false,
        remaining: 0,
        reset: existing.expires,
        retryAfter: Math.ceil((existing.expires - now) / 1000)
      };
    }

    existing.count += 1;
    return {
      allowed: true,
      remaining: options.max - existing.count,
      reset: existing.expires
    };
  }
}

export const rateLimiter = new InMemoryRateLimiter();
export type { RateLimitOptions: RateLimitResult };





