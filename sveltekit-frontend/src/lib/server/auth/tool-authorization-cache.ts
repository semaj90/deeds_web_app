/**
 * Tool Authorization Cache
 *
 * Caches permission grants in Redis to reduce:
 * - Repeated role-based permission lookups
 * - Database queries for user role resolution
 * - Latency on every tool authorization check
 *
 * Cache policy:
 * - Key: `auth:grant:{userId}`
 * - TTL: 5 minutes (user roles rarely change mid-session)
 * - Invalidation: manual via `invalidateGrantCache(userId)` after role changes
 */

import type { PermissionGrant } from '$lib/server/ace/atlas-tool-registry';

const CACHE_KEY_PREFIX = 'auth:grant:';
const CACHE_TTL_SECONDS = 300; // 5 minutes

/**
 * Get cached permission grant for user
 * Returns null if not cached or cache unavailable
 */
export async function getGrantFromCache(userId: string): Promise<PermissionGrant | null> {
  try {
    const { getRedis } = await import('$lib/server/redis.js');
    const redis = getRedis();

    const cached = await redis.get(`${CACHE_KEY_PREFIX}${userId}`);
    if (!cached) return null;

    const parsed = JSON.parse(cached);
    // Reconstruct Set from array
    return {
      userId: parsed.userId,
      permissions: new Set(parsed.permissions),
    };
  } catch (err) {
    // Cache miss or unavailable Redis — non-blocking
    console.debug('[AuthCache] Get failed:', err);
    return null;
  }
}

/**
 * Store permission grant in cache
 */
export async function setGrantInCache(grant: PermissionGrant): Promise<void> {
  try {
    const { getRedis } = await import('$lib/server/redis.js');
    const redis = getRedis();

    const serialized = JSON.stringify({
      userId: grant.userId,
      permissions: Array.from(grant.permissions), // Convert Set to array for JSON
    });

    await redis.setex(`${CACHE_KEY_PREFIX}${grant.userId}`, CACHE_TTL_SECONDS, serialized);
  } catch (err) {
    // Cache write failure is non-blocking
    console.debug('[AuthCache] Set failed:', err);
  }
}

/**
 * Invalidate cached permission grant for user
 * Called when user role changes or session ends
 */
export async function invalidateGrantCache(userId: string): Promise<void> {
  try {
    const { getRedis } = await import('$lib/server/redis.js');
    const redis = getRedis();

    await redis.del(`${CACHE_KEY_PREFIX}${userId}`);
  } catch (err) {
    // Invalidation failure is non-blocking
    console.debug('[AuthCache] Invalidate failed:', err);
  }
}

/**
 * Derive permission grant with caching
 * 1. Check cache (fast path)
 * 2. Derive from user role (slow path)
 * 3. Store in cache for next time
 */
export async function derivePermissionGrantCached(
  event: any // RequestEvent
): Promise<PermissionGrant> {
  const user = event.locals?.user;
  if (!user) {
    throw new Error('derivePermissionGrantCached requires authenticated user');
  }

  // Check cache first
  const cached = await getGrantFromCache(user.id);
  if (cached) {
    console.debug('[AuthCache] Hit:', user.id);
    return cached;
  }

  // Cache miss — derive from scratch
  const { derivePermissionGrant } = await import('./tool-authorization.js');
  const grant = derivePermissionGrant(event);

  // Store in cache for future requests
  await setGrantInCache(grant);

  return grant;
}

/**
 * Get cache stats (for monitoring)
 */
export async function getGrantCacheStats(): Promise<{
  keysScanned: number;
  totalTtl: number;
  avgTtl: number;
}> {
  try {
    const { getRedis } = await import('$lib/server/redis.js');
    const redis = getRedis();

    // Scan for all auth:grant:* keys
    const keys: string[] = [];
    let cursor = '0';

    do {
      const [newCursor, scannedKeys] = await redis.scan(
        cursor,
        'MATCH',
        `${CACHE_KEY_PREFIX}*`,
        'COUNT',
        '100'
      );
      cursor = newCursor;
      keys.push(...scannedKeys);
    } while (cursor !== '0');

    if (keys.length === 0) {
      return { keysScanned: 0, totalTtl: 0, avgTtl: 0 };
    }

    // Get TTL for each key
    const ttls = await Promise.all(keys.map((key) => redis.ttl(key)));
    const validTtls = ttls.filter((ttl) => ttl > 0);
    const totalTtl = validTtls.reduce((a, b) => a + b, 0);

    return {
      keysScanned: keys.length,
      totalTtl,
      avgTtl: validTtls.length > 0 ? totalTtl / validTtls.length : 0,
    };
  } catch (err) {
    console.debug('[AuthCache] Stats query failed:', err);
    return { keysScanned: 0, totalTtl: 0, avgTtl: 0 };
  }
}
