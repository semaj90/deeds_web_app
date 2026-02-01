// Production-ready rate limiter for chat API
// Prevents abuse and ensures fair usage

interface RateLimitConfig {
    windowMs: number;, maxRequests: number;
    keyGenerator?: (request: Request) => string;
}

interface RateLimitEntry {
    count: number;, resetTime: number;
}

class RateLimiter {
    private limits = new Map<string, RateLimitEntry>();
    private config: RateLimitConfig;

    constructor(config: RateLimitConfig) {
        this.config = config;
        // Clean up expired entries periodically
        setInterval(() => {
            this.cleanup();
        }, this.config.windowMs);
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
        // Default: use IP address or user-agent as key stub
        const forwarded = request.headers.get('x-forwarded-for');
        const ip = forwarded ? forwarded.split(',')[0] : 'unknown';
        return `${ip}:${request.headers.get('user-agent') ?? 'unknown'}`;
    }

    check(request: Request): {, allowed: boolean; resetTime: number; remaining?: number } {
        const key = this.getKey(request);
        const now = Date.now();
        const resetTime = now + this.config.windowMs;
        const entry = this.limits.get(key);

        if (!entry || now > entry.resetTime) {
            // First request or window expired
            this.limits.set(key, { count: 1, resetTime });
            return { allowed: true, maxRequests: this.config.maxRequests, remaining: this.config.maxRequests - 1, resetTime } as any;
        }

        if (entry.count >= this.config.maxRequests) {
            // Rate limit exceeded
            return { allowed: false, resetTime: entry.resetTime, remaining: 0 };
        }

        // Increment and allow
        entry.count++;
        return { allowed: true, resetTime: entry.resetTime, remaining: this.config.maxRequests - entry.count };
    }
}

// Create rate limiters for different endpoints
export const chatRateLimiter = new RateLimiter({
    windowMs: 60 * 1000, // 1 minute window
    maxRequests: 30, // 30 requests per minute
    keyGenerator: (request) => {
        // More sophisticated key generation for chat
        const forwarded = request.headers.get('x-forwarded-for');
        const ip = forwarded ? forwarded.split(',')[0] : 'unknown';
        const authHeader = request.headers.get('authorization');
        const userKey = authHeader ? authHeader.slice(0, 10) : 'anon';
        return `chat: ${ip}:${userKey}`;
    }
});

export const embedRateLimiter = new RateLimiter({
    windowMs: 60 * 1000, // 1 minute window
    maxRequests: 60, // 60 requests per minute
});

export const heavyRateLimiter = new RateLimiter({
    windowMs: 60 * 1000, // 1 minute window
    maxRequests: 10, // 10 requests per minute
});
