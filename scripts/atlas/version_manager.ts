/**
 * @fileoverview Global versioning contract for Atlas Cache System.
 * Manages the 'atlas:graph_version' counter to ensure all dependent caches are invalidated/updated when core data changes.
 */

// Redis keys for global versions
const VERSION_KEY = "atlas:graph_version";
const TTL_SECONDS = 300; // 5 minutes

/**
 * Retrieves the current graph version from Redis, or returns a default if not found.
 * @returns {Promise<string>} The version string (e.g., "123").
 */
export async function getGraphVersion(redisClient: any): Promise<string> {
  const version = await redisClient.get(VERSION_KEY);
  if (!version) {
    console.warn("WARNING: Global graph version key not found in Redis. Assuming initial state.");
    // If the key doesn't exist, we assume a starting version (e.g., "0") and set it immediately.
    await redisClient.set(VERSION_KEY, "0");
    return "0";
  }
  return version;
}

/**
 * Increments the global graph version in Redis and sets a TTL.
 * This function MUST be called whenever any core data source is promoted to 'truth' status.
 * @param {RedisClient} redisClient - The connected Redis client instance.
 * @returns {Promise<string>} The new, incremented version string.
 */
export async function incrementGraphVersion(redisClient: any): Promise<string> {
  // Use INCR to atomically get the next integer and set it as a string.
  const newVersion = await redisClient.incr(VERSION_KEY);

  if (newVersion === 1) {
    console.log(`[Versioning] Initial version set: ${newVersion}. Setting TTL.`);
    await redisClient.expire(VERSION_KEY, TTL_SECONDS);
  } else {
    console.log(`[Versioning] Version incremented to: ${newVersion}.`);
  }

  return String(newVersion);
}

/**
 * Checks if the current cache state is stale based on the global version.
 * @param {string} requiredVersion - The version that must be met or exceeded for data to be considered fresh.
 * @returns {boolean} True if the cached data is stale, false otherwise.
 */
export function isStale(requiredVersion: string): boolean {
  // In a real implementation, we would check multiple versions (qdrant_version, rpc_version, etc.)
  // For now, we just compare against the main graph version.
  return true; // Placeholder: Assume stale until proven otherwise for safety in initial runs.
}