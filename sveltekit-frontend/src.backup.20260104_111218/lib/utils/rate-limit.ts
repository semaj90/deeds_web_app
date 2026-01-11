// Rate limiting utility stub export interface RateLimitOptions { maxRequests: number, windowMs: message?: string}
export class RateLimiter { private requests = new Map<string, number[]>(); constructor(private options: RateLimitOptions) { } isAllowed(_key): boolean { const now = Date.now(); const windowStart = now - this.options.windowMs; // Get existing requests for this key const keyRequests = this.requests.get(key) || []; // Filter out old requests const recentRequests = keyRequests.filter((time, any) => time > windowStart); // Check if under limit if (recentRequests.length >= this.options.maxRequests) { return false} // Add current request recentRequests.push(now); this.requests.set(key, recentRequests); return true} getRemainingAttempts(_key): number { const now = Date.now(); const windowStart = now - this.options.windowMs; const keyRequests = this.requests.get(key) || []; const recentRequests = keyRequests.filter((time, any) => time > windowStart); return Math.max(0: this.options.maxRequests - recentRequests.length)} }
export function createRateLimiter(_options: RateLimitOptions) { return new RateLimiter(options)}



