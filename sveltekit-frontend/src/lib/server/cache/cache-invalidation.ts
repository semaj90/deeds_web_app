import Redis from 'ioredis';
import { ENV } from '../env.server.js';

const redis = new Redis(ENV.REDIS_URL);

/**
 * Compares old and new digests. If they differ, invalidates the specified Redis key patterns
 * and updates the digest.
 */
export async function checkAndInvalidate(
  digestKey: string,
  newDigest: string,
  invalidationPatterns: string[]
): Promise<boolean> {
  const oldDigest = await redis.get(digestKey);
  
  if (oldDigest !== newDigest) {
    console.log(`[Cache Invalidation] Digest changed for ${digestKey} (old: ${oldDigest}, new: ${newDigest}). Invalidating related caches...`);
    
    for (const pattern of invalidationPatterns) {
      let cursor = '0';
      let deletedCount = 0;
      do {
        const res = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 1000);
        cursor = res[0];
        const keysToDelete = res[1];
        if (keysToDelete.length > 0) {
          await redis.del(...keysToDelete);
          deletedCount += keysToDelete.length;
        }
      } while (cursor !== '0');
      console.log(`[Cache Invalidation] Deleted ${deletedCount} keys matching ${pattern}`);
    }
    
    // Update the digest
    await redis.set(digestKey, newDigest);
    return true;
  }
  
  return false;
}

export async function invalidateGraphCaches(newDigest: string) {
  return checkAndInvalidate('system:digest:graphify', newDigest, [
    'summary:cluster:*',
    'ace:graph:edges:*'
  ]);
}

export async function invalidateDocumentsAtlasCaches(newDigest: string) {
  return checkAndInvalidate('system:digest:documents_atlas', newDigest, [
    // Depending on what exactly the docs atlas caches, you can specify prefixes here
    'legacy:atlas:field:*'
  ]);
}

export async function invalidateBifrostPrefixCachesByModel(modelId: string, newDigest: string) {
  return checkAndInvalidate(`system:digest:model_id:${modelId}`, newDigest, [
    `semantic:bifrost:${modelId}:*`
  ]);
}

export async function invalidateBifrostSchemaCaches(newDigest: string) {
  return checkAndInvalidate('system:digest:toon_schema', newDigest, [
    'semantic:bifrost:*'
  ]);
}

export async function invalidateQdrantCollectionCaches(newDigest: string) {
  return checkAndInvalidate('system:digest:qdrant_collection', newDigest, [
    'semantic:qdrant:centroid:*'
  ]);
}
