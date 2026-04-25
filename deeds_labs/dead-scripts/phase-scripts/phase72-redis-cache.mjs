#!/usr/bin/env node

/**
 * Phase 72 Redis Cache Layer
 *
 * Caches error vectors and summaries to avoid re-embedding
 * Key patterns:
 *   phase72:vec:error:{error_hash} → JSON array (embedding)
 *   phase72:vec:summary:{cluster_id}:{cycle} → JSON array (embedding)
 *   phase72:summary:text:{cluster_id}:{cycle} → plain text
 */

import Redis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379'
const CACHE_TTL = 86400 * 7 // 7 days

let redis = null

/**
 * Initialize Redis connection
 */
export function initRedis() {
  if (redis) return redis

  redis = new Redis(REDIS_URL)

  redis.on('error', (err) => {
    console.error('[phase72-cache] Redis error:', err)
  })

  redis.on('connect', () => {
    console.log('[phase72-cache] Redis connected')
  })

  return redis
}

/**
 * Get cached error vector
 */
export async function getCachedErrorVector(errorHash) {
  const r = initRedis()
  const key = `phase72:vec:error:${errorHash}`

  try {
    const cached = await r.get(key)
    if (cached) {
      return JSON.parse(cached)
    }
  } catch (err) {
    console.error(`[phase72-cache] Error getting ${key}:`, err)
  }

  return null
}

/**
 * Cache error vector
 */
export async function cacheErrorVector(errorHash, vector) {
  const r = initRedis()
  const key = `phase72:vec:error:${errorHash}`

  try {
    await r.setex(key, CACHE_TTL, JSON.stringify(vector))
  } catch (err) {
    console.error(`[phase72-cache] Error setting ${key}:`, err)
  }
}

/**
 * Get cached summary vector
 */
export async function getCachedSummaryVector(clusterId, cycle) {
  const r = initRedis()
  const key = `phase72:vec:summary:${clusterId}:${cycle}`

  try {
    const cached = await r.get(key)
    if (cached) {
      return JSON.parse(cached)
    }
  } catch (err) {
    console.error(`[phase72-cache] Error getting ${key}:`, err)
  }

  return null
}

/**
 * Cache summary vector
 */
export async function cacheSummaryVector(clusterId, cycle, vector) {
  const r = initRedis()
  const key = `phase72:vec:summary:${clusterId}:${cycle}`

  try {
    await r.setex(key, CACHE_TTL, JSON.stringify(vector))
  } catch (err) {
    console.error(`[phase72-cache] Error setting ${key}:`, err)
  }
}

/**
 * Get cached summary text
 */
export async function getCachedSummaryText(clusterId, cycle) {
  const r = initRedis()
  const key = `phase72:summary:text:${clusterId}:${cycle}`

  try {
    return await r.get(key)
  } catch (err) {
    console.error(`[phase72-cache] Error getting ${key}:`, err)
  }

  return null
}

/**
 * Cache summary text
 */
export async function cacheSummaryText(clusterId, cycle, text) {
  const r = initRedis()
  const key = `phase72:summary:text:${clusterId}:${cycle}`

  try {
    await r.setex(key, CACHE_TTL, text)
  } catch (err) {
    console.error(`[phase72-cache] Error setting ${key}:`, err)
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats() {
  const r = initRedis()

  try {
    const info = await r.info('stats')
    const dbsize = await r.dbsize()

    return {
      dbsize,
      info
    }
  } catch (err) {
    console.error('[phase72-cache] Error getting stats:', err)
    return { dbsize: 0, info: '' }
  }
}

/**
 * Clear all Phase 72 cache
 */
export async function clearPhase72Cache() {
  const r = initRedis()

  try {
    const keys = await r.keys('phase72:*')
    if (keys.length > 0) {
      await r.del(...keys)
      console.log(`[phase72-cache] Cleared ${keys.length} keys`)
    }
  } catch (err) {
    console.error('[phase72-cache] Error clearing cache:', err)
  }
}

/**
 * Close Redis connection
 */
export async function closeRedis() {
  if (redis) {
    await redis.quit()
    redis = null
  }
}

// CLI: Show cache stats
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = initRedis()

  try {
    const stats = await getCacheStats()
    console.log('Phase 72 Cache Stats:')
    console.log(`  DB Size: ${stats.dbsize} keys`)
    console.log(`  Info: ${stats.info.split('\n').slice(0, 5).join('\n  ')}`)
  } catch (err) {
    console.error('Error:', err)
  } finally {
    await closeRedis()
  }
}

export default {
  initRedis,
  getCachedErrorVector,
  cacheErrorVector,
  getCachedSummaryVector,
  cacheSummaryVector,
  getCachedSummaryText,
  cacheSummaryText,
  getCacheStats,
  clearPhase72Cache,
  closeRedis
}
