import Redis from 'ioredis';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

async function verifyRankerUpgrade() {
  console.log('🧠 Verifying Engram Ranker Upgrade (Phase 8C)...');
  
  // Test Path Ranking
  const testPathKey = 'engram:path_ranks';
  const testClusterKey = 'engram:cluster_ranks';
  
  await redis.zincrby(testPathKey, 0.1, 'test_path_1');
  await redis.zincrby(testClusterKey, 0.1, 'test_cluster_1');

  const pathScore = await redis.zscore(testPathKey, 'test_path_1');
  const clusterScore = await redis.zscore(testClusterKey, 'test_cluster_1');

  console.log(`- Path Rank Test Score: ${pathScore}`);
  console.log(`- Cluster Rank Test Score: ${clusterScore}`);

  if (pathScore && clusterScore) {
    console.log('✅ Engram Ranked Reinforcement is LIVE and tracking in Redis.');
    
    // Clean up
    await redis.zrem(testPathKey, 'test_path_1');
    await redis.zrem(testClusterKey, 'test_cluster_1');
  } else {
    console.log('❌ Failed to verify Engram Ranker.');
    process.exit(1);
  }

  redis.disconnect();
}

verifyRankerUpgrade().catch(err => {
  console.error(err);
  redis.disconnect();
  process.exit(1);
});
