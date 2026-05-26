import { normalizeLabels } from '$lib/server/labels/normalize-labels';
import { qdrantClient } from '$lib/server/qdrant'; // Assuming a qdrant client setup exists

/**
 * Syncs normalized labels to Qdrant vector payload filters.
 * @param clusterKey The key identifying the cluster.
 * @param rawData The raw data payload containing jsonb and centroid info.
 */
export async function syncQdrantLabels(clusterKey: string, rawData: { jsonb?: any, centroid?: { label: string; topology?: string }[], karpathy?: any }): Promise<boolean> {
  try {
    // 1. Normalize labels using the provided function
    const { centroid_label, topology_label, hotness_bucket, feature_family, tags } = normalizeLabels(rawData);
    
    // 2. Prepare Qdrant filter payload
    const qdrantFilterPayload = {
      cluster_key: clusterKey,
      centroid_label: centroid_label || null,
      topology_label: topology_label || null,
      hotness_bucket: hotness_bucket,
      feature_family: feature_family,
      metadata_tags: tags
    };

    // 3. Upsert/Update the vector payload filter in Qdrant
    // NOTE: The exact Qdrant API call depends on the client wrapper. 
    // This assumes a method exists to update payload filters for a given ID/Key.
    await qdrantClient.upsert(clusterKey, qdrantFilterPayload);
    console.log(`Successfully synced labels for key: ${clusterKey} to Qdrant.`);
    return true;
  } catch (error) {
    console.error(`Error syncing labels for ${clusterKey} to Qdrant:`, error);
    return false;
  }
}
