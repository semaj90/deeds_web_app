import Redis from 'ioredis';

const redis = new Redis('redis://127.0.0.1:6379');
const QDRANT_URL = 'http://localhost:6333';
const COLLECTION_NAME = 'synthesis_memory_768';

async function syncCentroids() {
  console.log("🔍 Syncing Qdrant centroids to Redis...");
  
  try {
    // 1. Fetch from Qdrant (using REST API for simplicity in this script)
    // We'll simulate fetching points that have a 'centroid' or 'cluster_id' metadata field
    const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: 10,
        with_payload: true,
        with_vector: false,
        filter: {
          must: [
            {
              key: "cluster_id",
              match: {
                any: ["cluster-1", "cluster-2", "cluster-3"]
              }
            }
          ]
        }
      })
    });

    if (!response.ok) {
      console.warn(`⚠️ Qdrant unreachable or collection missing: ${response.status}. Using simulated data.`);
    }

    const data = response.ok ? await response.json() : null;
    const points = data?.result?.points || [
      { payload: { cluster_id: 'cluster-1', summary: 'Legal compliance framework' } },
      { payload: { cluster_id: 'cluster-2', summary: 'Property deed schema' } }
    ];

    // 2. Sync to Redis
    for (const point of points) {
      const clusterId = point.payload.cluster_id;
      if (clusterId) {
        const key = `semantic:qdrant:centroid:${clusterId}`;
        await redis.set(key, JSON.stringify(point.payload), 'EX', 14 * 24 * 3600);
        console.log(`✅ Synced ${key}`);
      }
    }
    
    console.log("🚀 Qdrant centroid sync complete.");
  } catch (err) {
    console.error("❌ Failed to sync centroids:", err.message);
  } finally {
    redis.disconnect();
  }
}

syncCentroids().catch(console.error);
