#!/usr/bin/env node
/**
 * benchmark-topology-lookup.mjs
 * 
 * Compares "brute-force" centroid scan vs "greedy topology walk" performance.
 */
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const PREFIX = process.env.HG_PREFIX || 'hypergraph:codebase_chunks_768';
const LOOKUP_URL = 'http://127.0.0.1:9234/lookup';

function l2sq(a,b){ let s=0; for(let i=0;i<a.length;i++){ const d=(a[i]||0)-(b[i]||0); s+=d*d; } return s; }

async function benchmark() {
  console.log(`⏱️ Benchmarking Hypergraph Topology Lookup`);
  const redis = new Redis(REDIS_URL);
  
  try {
    const metaRaw = await redis.hget(PREFIX + ':centroids', 'meta');
    if (!metaRaw) throw new Error('No centroids found in Redis. Run pipeline first.');
    const meta = JSON.parse(metaRaw);
    console.log(`📊 Centroids: ${meta.K}, Dims: ${meta.dims}`);
    
    // Create a random query vector
    const queryVec = Array.from({ length: meta.dims }, () => Math.random() * 2 - 1);
    
    // 1. Brute Force (Local implementation for comparison)
    console.log('\n--- Brute Force Scan ---');
    const startBrute = performance.now();
    const allCentroids = await redis.hgetall(PREFIX + ':centroids');
    const items = [];
    for (const [id, val] of Object.entries(allCentroids)) {
      if (id === 'meta') continue;
      items.push({ id, vector: JSON.parse(val).vector });
    }
    let bestDist = Infinity;
    let bestId = null;
    for (const item of items) {
      const d = l2sq(queryVec, item.vector);
      if (d < bestDist) { bestDist = d; bestId = item.id; }
    }
    const endBrute = performance.now();
    console.log(`⏱️ Time: ${(endBrute - startBrute).toFixed(2)}ms`);
    console.log(`🎯 Best Centroid: ${bestId}, Dist: ${bestDist.toFixed(4)}`);
    
    // 2. Greedy Topology Search (via Lookup Server)
    console.log('\n--- Greedy Topology Walk (Server) ---');
    const startGreedy = performance.now();
    const res = await fetch(LOOKUP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embedding: queryVec, k: 1 })
    });
    if (!res.ok) throw new Error(`Lookup server error: ${res.status}`);
    const data = await res.json();
    const endGreedy = performance.now();
    
    console.log(`⏱️ Time: ${(endGreedy - startGreedy).toFixed(2)}ms`);
    console.log(`🎯 Best Centroid: ${data.results[0]?.id}, Dist: ${data.results[0]?.dist.toFixed(4)}`);
    console.log(`🤖 Method: ${data.method}`);
    
    console.log('\n✅ Benchmark complete.');
    
  } catch (err) {
    console.error(`\n❌ Benchmark failed: ${err.message}`);
    if (err.message.includes('fetch')) {
      console.log('💡 Tip: Make sure the lookup server is running: node scripts/hypergraph-lookup-server.mjs');
    }
  } finally {
    await redis.disconnect();
  }
}

benchmark();
