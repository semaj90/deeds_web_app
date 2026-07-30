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
import {
  resolveAtlasRedisContext,
  runRedisCli,
  shouldPreferValkeyCli,
} from './lib/redis-valkey.mjs';

const CLUSTERS_JSON = path.join(process.cwd(), 'docs/graph/hypergraph-clusters.json');
const PREFIX = 'ace:cluster:';
const HLL_KEY = 'ace:cluster:hll:ids';

async function main() {
  console.log('🏛️  Atlas: Caching Hypergraph Cluster Cards');
  
  if (!existsSync(CLUSTERS_JSON)) {
    console.error(`❌ Missing cluster digest: ${CLUSTERS_JSON}`);
    console.error('💡 Run the hypergraph pipeline first.');
    process.exit(1);
  }

  const { env, container, password } = await resolveAtlasRedisContext(process.cwd());
  const host = env.VALKEY_HOST || env.REDIS_HOST || '127.0.0.1';
  const port = parseInt(env.VALKEY_PORT || env.REDIS_PORT || '6379', 10);
  const redisUrl = env.VALKEY_URL || env.REDIS_URL || `redis://${host}:${port}`;
  const preferCli = shouldPreferValkeyCli(env, container);

  const redis = preferCli
    ? {
        mode: 'cli',
        async connect() {},
        async ping() {
          const result = runRedisCli(container, ['PING'], password);
          if (!result.ok) throw new Error(result.stderr || result.error || 'redis-cli PING failed');
          return result.stdout.trim();
        },
        async set(key, value) {
          const result = runRedisCli(container, ['SET', key, value], password);
          if (!result.ok) throw new Error(result.stderr || result.error || 'redis-cli SET failed');
        },
        async pfadd(key, ...members) {
          const result = runRedisCli(container, ['PFADD', key, ...members], password);
          if (!result.ok) throw new Error(result.stderr || result.error || 'redis-cli PFADD failed');
        },
        async pfcount(key) {
          const result = runRedisCli(container, ['PFCOUNT', key], password);
          if (!result.ok) throw new Error(result.stderr || result.error || 'redis-cli PFCOUNT failed');
          return Number.parseInt(result.stdout.trim() || '0', 10) || 0;
        },
        async disconnect() {},
      }
    : new Redis(redisUrl);
  
  try {
    if (!preferCli) {
      await redis.connect();
      await redis.ping();
    } else {
      await redis.connect();
      await redis.ping();
    }
    const data = JSON.parse(readFileSync(CLUSTERS_JSON, 'utf-8'));
    const clusters = data.clusters || [];
    
    console.log(`📦 Processing ${clusters.length} clusters...`);

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

      await redis.set(`${PREFIX}${cluster.id}`, JSON.stringify(card));
      if (typeof redis.pfadd === 'function') {
        await redis.pfadd(HLL_KEY, cluster.id);
      }
    }

    console.log(`✅ Cached ${clusters.length} cluster cards in Redis.`);
    if (typeof redis.pfcount === 'function') {
      console.log(`🔢 HyperLogLog summary: ${HLL_KEY} = ${await redis.pfcount(HLL_KEY)}`);
    }
    
  } catch (err) {
    console.error(`❌ Atlas Cache Error: ${err.message}`);
    process.exit(1);
  } finally {
    await redis.disconnect();
  }
}

main();
