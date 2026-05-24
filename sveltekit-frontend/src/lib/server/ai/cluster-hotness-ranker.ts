import { getRedis } from '../redis.js';

export async function scoreClusterHotness(
  clusterId: string, 
  event: 'usage' | 'cache_hit' | 'synthesis_selection',
  metrics: { semanticScore?: number, graphCentrality?: number, recency?: number, confidence?: number } = {}
) {
  const redis = getRedis();
  if (!redis) return;

  const key = `ace:cluster:hot`;
  
  // Basic hotness tracking
  let cacheHotness = 1;
  if (event === 'cache_hit') cacheHotness = 2;
  if (event === 'synthesis_selection') cacheHotness = 5;

  // New composite clusterScore formula
  const semanticScore = metrics.semanticScore || 0;
  const graphCentrality = metrics.graphCentrality || 0;
  const recency = metrics.recency || 0;
  const confidence = metrics.confidence || 0;

  const clusterScore = 
    (semanticScore * 0.35) + 
    (graphCentrality * 0.25) + 
    (cacheHotness * 0.20) + 
    (recency * 0.10) + 
    (confidence * 0.10);

  try {
    // Add to sorted set using the composite score
    await redis.zincrby(key, clusterScore, clusterId);
    
    // We don't expire the hotness list directly, but we can decay it periodically.
    // The top clusters can be fetched via ZREVRANGE
  } catch (err) {
    console.error(`Failed to update cluster hotness for ${clusterId}`, err);
  }
}

export async function getTopClusters(limit: number = 10) {
  const redis = getRedis();
  if (!redis) return [];

  const key = `ace:cluster:hot`;
  try {
    return await redis.zrevrange(key, 0, limit - 1, 'WITHSCORES');
  } catch (err) {
    console.error(`Failed to get top clusters`, err);
    return [];
  }
}
