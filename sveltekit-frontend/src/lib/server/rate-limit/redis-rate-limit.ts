/**
 * Atomic Redis rate limiter.
 *
 * Key format: ratelimit:{bucket}:{identifier}:{windowSec}
 *   bucket     — sanitized route tier name (slashes → dashes)
 *   identifier — authenticated userId > IP (first available)
 *   windowSec  — window length in seconds
 *
 * Uses a Lua eval so INCR + conditional PEXPIRE are atomic:
 *   - TTL is set only on the FIRST request in a window (fixed window, not sliding)
 *   - Counters are consistent across all workers / instances via Redis
 *   - Falls back to in-memory Map when Redis is unavailable
 *
 * On Redis failure the response includes `degraded: true` so hooks can log a warning.
 */
import { getRedis } from '$lib/server/redis.js';

// ── Lua script ────────────────────────────────────────────────────────────────
// KEYS[1]  = full rate-limit key
// ARGV[1]  = window in milliseconds (string)
// Returns:  [count (integer), remaining PTTL in ms (integer)]
const LUA_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return {count, redis.call('PTTL', KEYS[1])}
`;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RateLimitResult {
	/** Whether this request is within the limit */
	allowed: boolean;
	/** Tier maximum (X-RateLimit-Limit) */
	limit: number;
	/** Requests remaining in this window */
	remaining: number;
	/** Seconds to wait before retrying (0 when allowed) */
	retryAfter: number;
	/** Epoch-ms when the window resets */
	resetMs: number;
	/** True when Redis was unavailable and in-memory fallback was used */
	degraded?: true;
}

// ── Key builder ───────────────────────────────────────────────────────────────

/**
 * Build a stable, debug-friendly Redis key.
 * Converts "/api/auth/login" → "api-auth-login".
 */
function buildKey(bucket: string, identifier: string, windowSec: number): string {
	const safeBucket = bucket.replace(/\//g, '-').replace(/^-+|-+$/g, '');
	return `ratelimit:${safeBucket}:${identifier}:${windowSec}`;
}

// ── In-memory fallback ────────────────────────────────────────────────────────

const FALLBACK_MAX_ENTRIES = 50_000;
const fallbackStore = new Map<string, { count: number; resetTime: number }>();

function fallbackCheck(
	key: string,
	max: number,
	windowMs: number
): RateLimitResult & { degraded: true } {
	const now = Date.now();
	const entry = fallbackStore.get(key);

	if (!entry || now > entry.resetTime) {
		if (!fallbackStore.has(key) && fallbackStore.size >= FALLBACK_MAX_ENTRIES) {
			const oldest = fallbackStore.keys().next().value;
			if (oldest) fallbackStore.delete(oldest);
		}
		const resetTime = now + windowMs;
		fallbackStore.set(key, { count: 1, resetTime });
		return { allowed: true, limit: max, remaining: max - 1, retryAfter: 0, resetMs: resetTime, degraded: true };
	}

	entry.count++;
	const allowed = entry.count <= max;
	return {
		allowed,
		limit: max,
		remaining: Math.max(0, max - entry.count),
		retryAfter: allowed ? 0 : Math.ceil((entry.resetTime - now) / 1000),
		resetMs: entry.resetTime,
		degraded: true,
	};
}

/**
 * Remove expired entries from the in-memory fallback.
 * Call this on an interval (e.g. every 60s) when using the fallback.
 */
export function evictFallback(): void {
	const now = Date.now();
	for (const [key, entry] of fallbackStore) {
		if (now > entry.resetTime) fallbackStore.delete(key);
	}
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check and increment a rate-limit counter.
 *
 * Identifier priority:
 *   1. Authenticated user ID (prevents unfair NAT-sharing)
 *   2. Client IP (fallback for unauthenticated routes)
 *
 * @param bucket      Tier name / route prefix (e.g. "/api/auth/login")
 * @param identifier  User ID or IP string
 * @param max         Maximum requests per window
 * @param windowMs    Window length in milliseconds
 */
export async function checkRedisRateLimit(opts: {
	bucket: string;
	identifier: string;
	max: number;
	windowMs: number;
}): Promise<RateLimitResult> {
	const windowSec = Math.ceil(opts.windowMs / 1000);
	const key = buildKey(opts.bucket, opts.identifier, windowSec);

	try {
		const redis = getRedis();
		const raw = (await (redis as any).eval(
			LUA_SCRIPT,
			1,
			key,
			String(opts.windowMs)
		)) as [number, number];

		const count = raw[0];
		const pttl = Math.max(0, raw[1]);
		const resetMs = Date.now() + pttl;
		const allowed = count <= opts.max;

		return {
			allowed,
			limit: opts.max,
			remaining: Math.max(0, opts.max - count),
			retryAfter: allowed ? 0 : Math.ceil(pttl / 1000),
			resetMs,
		};
	} catch (err) {
		console.warn(
			`[rate-limit] Redis unavailable — degraded in-memory fallback active. Error: ${
				(err as Error).message?.slice(0, 100) ?? 'unknown'
			}`
		);
		return fallbackCheck(key, opts.max, opts.windowMs);
	}
}
