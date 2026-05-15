#!/usr/bin/env node
/**
 * sync-hypergraph-to-redis.mjs
 * 
 * Takes the hypergraph-clusters.json digest and pushes per-cluster 
 * summary "cards" to Redis for fast ACE context injection.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const INPUT_JSON = path.join(process.cwd(), 'docs/graph/hypergraph-clusters.json');
const CARD_PREFIX = 'ace:cluster:';

async function sync() {
  console.log(`🔄 Syncing hypergraph clusters to Redis...`);
  console.log(`📂 Input: ${INPUT_JSON}`);
  
  const redis = new Redis(REDIS_URL);
  
  try {
    const data = JSON.parse(readFileSync(INPUT_JSON, 'utf-8'));
    const clusters = data.clusters || [];
    
    console.log(`📦 Found ${clusters.length} clusters.`);
    
    const pipeline = redis.pipeline();
    
    for (const cluster of clusters) {
      const card = {
        clusterId: `cluster_${cluster.id}`,
        label: cluster.inferredTopic,
        topPaths: cluster.topPaths.map(p => p.path),
        tags: cluster.topTags.map(t => t.tag),
        summary: `Cluster ${cluster.id} focuses on ${cluster.inferredTopic}. Dominant types: ${cluster.topKinds.map(k => k.kind).join(', ')}.`,
        recommendedActions: [
          `Explore symbols: ${cluster.topSymbols.slice(0, 3).map(s => s.symbol).join(', ') || 'N/A'}`,
          `Check primary directory: ${cluster.topDirs[0]?.dir || 'N/A'}`
        ],
        size: cluster.size
      };
      
      pipeline.set(`${CARD_PREFIX}${cluster.id}`, JSON.stringify(card));
    }
    
    const results = await pipeline.exec();
    const success = results.filter(([err]) => !err).length;
    
    console.log(`✅ Successfully synced ${success}/${clusters.length} cluster cards to Redis.`);
    
  } catch (err) {
    console.error(`\n❌ Sync failed: ${err.message}`);
    process.exit(1);
  } finally {
    await redis.disconnect();
  }
}

sync();
