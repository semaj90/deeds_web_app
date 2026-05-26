import Redis from 'ioredis';

const redis = new Redis('redis://127.0.0.1:6379');

async function warmSemanticCache() {
  console.log("🔥 Warming up Semantic Cache...");
  
  try {
    const clustersToWarm = [
      { id: 'cluster-1', summary: 'Legal compliance framework containing definitions and rules' },
      { id: 'cluster-2', summary: 'Property deed schema matching standard US legal docs' },
      { id: 'cluster-3', summary: 'Vector embeddings logic for legal text' }
    ];

    for (const cluster of clustersToWarm) {
      const key = `summary:cluster:${cluster.id}`;
      // Set with a 14 day expiration
      await redis.set(key, cluster.summary, 'EX', 14 * 24 * 3600);
      
      // Also add to the hot cluster list to test that retrieval path
      await redis.zadd('ace:cluster:hot', 10, cluster.id);
      
      console.log(`✅ Warmed ${key}`);
    }

    console.log("🚀 Semantic Cache warming complete.");
  } catch (err) {
    console.error("❌ Failed to warm semantic cache:", err);
  } finally {
    redis.disconnect();
  }
}

warmSemanticCache().catch(console.error);
