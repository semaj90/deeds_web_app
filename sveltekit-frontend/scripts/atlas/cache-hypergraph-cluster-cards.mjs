#!/usr/bin/env node
/**
 * cache-hypergraph-cluster-cards.mjs
 * 
 * Part of the Atlas topological retrieval infrastructure.
 * populates the Redis ace:cluster:* cache with human-readable 
 * distillates derived from the hypergraph cluster digest.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const CLUSTERS_JSON = path.join(process.cwd(), 'docs/graph/hypergraph-clusters.json');
const PREFIX = 'ace:cluster:';

async function main() {
  console.log('🏛️  Atlas: Caching Hypergraph Cluster Cards');
  
  if (!existsSync(CLUSTERS_JSON)) {
    console.error(`❌ Missing cluster digest: ${CLUSTERS_JSON}`);
    console.error('💡 Run the hypergraph pipeline first.');
    process.exit(1);
  }

  const redis = new Redis(REDIS_URL);
  
  try {
    const data = JSON.parse(readFileSync(CLUSTERS_JSON, 'utf-8'));
    const clusters = data.clusters || [];
    
    console.log(`📦 Processing ${clusters.length} clusters...`);
    
    const pipeline = redis.pipeline();
    
    for (const cluster of clusters) {
      const card = {
        clusterId: cluster.id,
        topic: cluster.inferredTopic,
        dir: cluster.topDirs[0]?.dir || 'unknown',
        tags: cluster.topTags.map(t => t.tag),
        summary: cluster.inferredTopic,
        files: cluster.topPaths.slice(0, 5).map(p => p.path),
        stats: {
          size: cluster.size,
          kind: cluster.topKinds[0]?.kind || 'unknown'
        },
        updatedAt: new Date().toISOString()
      };
      
      pipeline.set(`${PREFIX}${cluster.id}`, JSON.stringify(card));
    }
    
    const results = await pipeline.exec();
    const errors = results.filter(([err]) => err);
    
    if (errors.length > 0) {
      console.error(`⚠️  Encountered ${errors.length} errors during Redis sync.`);
    }
    
    console.log(`✅ Cached ${clusters.length} cluster cards in Redis.`);
    
  } catch (err) {
    console.error(`❌ Atlas Cache Error: ${err.message}`);
    process.exit(1);
  } finally {
    await redis.disconnect();
  }
}

main();
