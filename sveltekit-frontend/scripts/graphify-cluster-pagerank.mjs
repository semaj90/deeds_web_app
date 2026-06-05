#!/usr/bin/env node
/**
 * graphify-cluster-pagerank.mjs
 * 
 * Aggregates file-level Karpathy GPU scores (PageRank, blend, attention) 
 * up to the SOM cluster level to provide topological cluster authority.
 * 
 * Inverse maps file -> cluster using docs/graph/hypergraph-clusters.json
 * and updates the JSON with cluster-level authority metrics, and pushes
 * to Redis `gpu:karpathy:clusters`.
 * 
 * Usage:
 *   node scripts/graphify-cluster-pagerank.mjs
 */

import { createRequire } from 'module';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;
const HYPERGRAPH_PATH = resolve(ROOT, 'docs/graph/hypergraph-clusters.json');

function uniqueByFilePath(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    if (!row?.filePath || seen.has(row.filePath)) continue;
    seen.add(row.filePath);
    out.push(row);
  }
  return out;
}

async function createRedis() {
  const req = createRequire(import.meta.url);
  let Redis;
  try {
    Redis = req('ioredis');
    if (Redis.default) Redis = Redis.default;
  } catch {
    throw new Error('ioredis not found');
  }
  const client = new Redis(REDIS_URL, {
    password: REDIS_PASSWORD,
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  });
  await client.connect();
  Object.defineProperty(client, Symbol.asyncDispose, {
    value: async () => { try { await client.quit(); } catch { } },
    configurable: true, writable: false, enumerable: false,
  });
  return client;
}

async function main() {
  console.log('=== Cluster PageRank Inverse Mapping ===');
  
  if (!existsSync(HYPERGRAPH_PATH)) {
    console.error(`Not found: ${HYPERGRAPH_PATH}`);
    process.exit(1);
  }

  const rawClusters = JSON.parse(readFileSync(HYPERGRAPH_PATH, 'utf-8'));
  const clusters = Array.isArray(rawClusters)
    ? rawClusters
    : Array.isArray(rawClusters.clusters)
      ? rawClusters.clusters
      : Array.isArray(rawClusters.items)
        ? rawClusters.items
        : [];
  console.log(`Loaded ${clusters.length} clusters.`);

  const redis = await createRedis();
  
  console.log('Fetching file-level Karpathy scores from Redis...');
  const scoresHash = await redis.hgetall('gpu:karpathy:scores');
  const fileScores = new Map();
  
  for (const [file, raw] of Object.entries(scoresHash)) {
    try {
      fileScores.set(file, JSON.parse(raw));
    } catch { }
  }
  
  console.log(`Loaded scores for ${fileScores.size} files.`);

  const clusterAuthority = {};

  let updated = 0;
  for (const c of clusters) {
    const memberFiles = c.memberFiles || [];
    let totalBlend = 0;
    let totalPr = 0;
    let maxBlend = 0;
    let maxPr = 0;
    let scoredMembers = 0;
    const scored = [];
    
    // Normalize member paths to match Redis keys
    const paths = memberFiles.map(m => typeof m === 'string' ? m : (m.path || m.file || m.rel));
    
    for (let p of paths) {
      if (!p) continue;
      // Normalise Windows paths and src/ prefix
      let key = p.replace(/\\/g, '/');
      if (!key.startsWith('src/') && !key.startsWith('docs/')) {
        key = 'src/' + key.replace(/^.*src\//, '');
      }
      
      const s = fileScores.get(key) || fileScores.get(p);
      if (s) {
        totalBlend += (s.blend || 0);
        totalPr += (s.pr || 0);
        maxBlend = Math.max(maxBlend, s.blend || 0);
        maxPr = Math.max(maxPr, s.pr || 0);
        scoredMembers++;
        scored.push({
          filePath: key,
          pageRank: +(s.pr || 0),
          karpathyBlend: +(s.blend || 0),
        });
      }
    }
    
    const avgBlend = scoredMembers > 0 ? totalBlend / scoredMembers : 0;
    const avgPr = scoredMembers > 0 ? totalPr / scoredMembers : 0;
    const clusterAuthorityScore = +(0.7 * maxPr + 0.3 * avgPr).toFixed(4);
    
    // Use an aggregation metric: max is usually best for finding clusters with key files
    // but avg is good for general cluster health. We'll store both.
    c.authority = {
      maxBlend: +maxBlend.toFixed(4),
      maxPr: +maxPr.toFixed(4),
      avgBlend: +avgBlend.toFixed(4),
      avgPr: +avgPr.toFixed(4),
      totalBlend: +totalBlend.toFixed(4),
      clusterAuthorityScore,
      scoredFiles: scoredMembers,
      totalFiles: paths.length,
      topPrFiles: uniqueByFilePath(scored
        .slice()
        .sort((a, b) => b.pageRank - a.pageRank || b.karpathyBlend - a.karpathyBlend)
      ).slice(0, 5),
      topBlendFiles: uniqueByFilePath(scored
        .slice()
        .sort((a, b) => b.karpathyBlend - a.karpathyBlend || b.pageRank - a.pageRank)
      ).slice(0, 5),
    };
    
    // Set a primary blend score for the cluster for sorting
    c.clusterBlend = +(maxBlend * 0.7 + avgBlend * 0.3).toFixed(4);

    clusterAuthority[c.id ?? c.clusterId] = JSON.stringify(c.authority);
    updated++;
  }
  
  // Sort clusters by their new clusterBlend score
  clusters.sort((a, b) => (b.clusterBlend || 0) - (a.clusterBlend || 0));

  writeFileSync(HYPERGRAPH_PATH, JSON.stringify(clusters, null, 2));
  console.log(`Updated ${updated} clusters with authority scores in ${HYPERGRAPH_PATH}`);
  
  if (Object.keys(clusterAuthority).length > 0) {
    await redis.del('gpu:karpathy:clusters');
    await redis.hset('gpu:karpathy:clusters', clusterAuthority);
    console.log(`Pushed cluster authority scores to Redis 'gpu:karpathy:clusters'`);

    const pagerankFields = {};
    const top5Fields = {};
    for (const c of clusters) {
      const clusterId = c.id ?? c.clusterId;
      const authority = c.authority ?? {};
      const topPrFiles = authority.topPrFiles ?? [];
      const pagerankRecord = JSON.stringify({
        clusterId,
        clusterAuthorityScore: authority.clusterAuthorityScore ?? 0,
        avgPageRank: authority.avgPr ?? 0,
        maxPageRank: authority.maxPr ?? 0,
        memberCount: authority.totalFiles ?? 0,
      });
      const top5Record = JSON.stringify(topPrFiles.map((f) => ({
        filePath: f.filePath,
        pageRank: f.pageRank,
        karpathyBlend: f.karpathyBlend,
      })));
      pagerankFields[String(clusterId)] = pagerankRecord;
      top5Fields[String(clusterId)] = top5Record;
      await redis.set(`cluster:pagerank:${clusterId}`, pagerankRecord);
      await redis.set(`cluster:pagerank:top5:${clusterId}`, top5Record);
      await redis.expire(`cluster:pagerank:${clusterId}`, 21_600);
      await redis.expire(`cluster:pagerank:top5:${clusterId}`, 21_600);
    }
    await redis.del('cluster:pagerank');
    await redis.del('cluster:pagerank:top5');
    await redis.hset('cluster:pagerank', pagerankFields);
    await redis.hset('cluster:pagerank:top5', top5Fields);
    await redis.expire('cluster:pagerank', 21_600);
    await redis.expire('cluster:pagerank:top5', 21_600);
  }

  // Print top 5 clusters
  console.log('\nTop 5 Clusters by Authority:');
  for (let i = 0; i < 5 && i < clusters.length; i++) {
    const c = clusters[i];
    const topic = c.inferredTopic || 'Unknown';
    console.log(`${i+1}. [${c.id ?? c.clusterId}] ${topic.substring(0, 50)}... (Blend: ${c.clusterBlend}, MaxPR: ${c.authority.maxPr})`);
  }
  
  await redis.quit();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

