#!/usr/bin/env node
/**
 * sync-clusters-to-kag.mjs
 * 
 * Injects hypergraph cluster digests into the Karpathy-wiki (Redis KAG notes).
 * Allows ACE to retrieve cluster-level summaries during context assembly.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const INPUT_JSON = path.join(process.cwd(), 'docs/graph/hypergraph-clusters.json');
const KAG_PREFIX = 'wiki:note:dir:cluster:';

async function sync() {
  console.log(`🧠 Syncing hypergraph clusters to Karpathy KAG cache...`);
  const redis = new Redis(REDIS_URL);
  
  try {
    const data = JSON.parse(readFileSync(INPUT_JSON, 'utf-8'));
    const clusters = data.clusters || [];
    
    console.log(`📦 Found ${clusters.length} clusters.`);
    
    const pipeline = redis.pipeline();
    const now = new Date().toISOString();
    
    for (const cluster of clusters) {
      const wikiDoc = {
        type: 'cluster',
        clusterId: cluster.id,
        clusterType: 'gpu',
        purpose: `Hypergraph Cluster: ${cluster.id}`,
        summary: `Cluster focuses on ${cluster.inferredTopic}. It contains approximately ${cluster.size} chunks.`,
        dominantTags: cluster.topTags.map(t => t.tag),
        representativeFiles: cluster.topPaths.map(p => p.path),
        topologicalNeighbors: [], // To be populated by topology-writer if needed
        relatedErrors: [],
        patterns: [],
        warnings: [],
        pageRankTop5: [],
        directoryPath: cluster.topDirs[0]?.dir || '',
        auditScore: 85, // Default high score for synthesized clusters
        generatedAt: now,
        version: 2
      };
      
      const key = `${KAG_PREFIX}${cluster.id}`;
      pipeline.setex(key, 86400 * 7, JSON.stringify(wikiDoc)); // 7 days TTL
    }
    
    const results = await pipeline.exec();
    const success = results.filter(([err]) => !err).length;
    
    console.log(`✅ Successfully synced ${success}/${clusters.length} cluster notes to Karpathy cache.`);
    
  } catch (err) {
    console.error(`\n❌ KAG Sync failed: ${err.message}`);
    process.exit(1);
  } finally {
    await redis.disconnect();
  }
}

sync();
