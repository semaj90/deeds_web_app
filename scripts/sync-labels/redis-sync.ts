import { normalizeLabels } from '$lib/server/labels/normalize-labels';
import { redisClient } from '$lib/server/redis'; // Assuming a redis client setup exists

/**
 * Syncs normalized labels to Redis for a given cluster key.
 * @param clusterKey The key identifying the cluster.
 * @param rawData The raw data payload containing jsonb and centroid info.
 */
export async function syncRedisLabels(clusterKey: string, rawData: { jsonb?: any, centroid?: { label: string; topology?: string }[], karpathy?: any }): Promise<boolean> {
  try {
    // 1. Normalize labels using the provided function
    const { centroid_label, topology_label, hotness_bucket, feature_family, tags } = normalizeLabels(rawData);
    
    // 2. Construct the Redis structure
    const redisKey = `ace:cluster:tags:${clusterKey}`;
    const redisPayload = {
      centroid_label: centroid_label || null,
      topology_label: topology_label || null,
      hotness_bucket: hotness_bucket,
      feature_family: feature_family,
      metadata_tags: tags
    };

    // 3. Update Redis (assuming SET or HSET structure)
    await redisClient.hset(redisKey, '*', JSON.stringify(redisPayload));
    console.log(`Successfully synced labels for key: ${clusterKey}`);
    return true;
  } catch (error) {
    console.error(`Error syncing labels for ${clusterKey} to Redis:`, error);
    return false;
  }
}
