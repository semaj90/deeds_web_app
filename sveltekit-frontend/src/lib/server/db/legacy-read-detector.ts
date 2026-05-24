import { getRedis } from '../redis.js';
import { ENV } from '../env.server.js';

export async function trackLegacyRead(field: string, source: string = 'unknown') {
  if (ENV.ENABLE_LEGACY_ATLAS_FIELDS === 'false') {
    console.warn(`[LEGACY READ DISABLED] Attempted to read ${field} from ${source}`);
    return null; // Force null when feature flag is off
  }

  const redis = getRedis();
  if (!redis) {
    console.warn("[LEGACY READ] Redis not available, logging locally:", field);
    return;
  }

  const stack = new Error().stack;
  
  try {
    // 1. Runtime increment
    const key = `legacy:atlas:field:${field}:reads`;
    await redis.incr(key);
    await redis.expire(key, 7 * 24 * 60 * 60); // 7 days

    // 2. Event list append
    const event = JSON.stringify({
      field,
      source,
      stack,
      timestamp: new Date().toISOString()
    });
    const listKey = `legacy:atlas:events`;
    await redis.lpush(listKey, event);
    await redis.ltrim(listKey, 0, 999);
    await redis.expire(listKey, 7 * 24 * 60 * 60);
    
    console.warn(`[LEGACY READ] documents_atlas_entries.${field} used`, { source });
  } catch (err) {
    console.error(`[LEGACY READ] Failed to track in Redis:`, err);
  }
}
