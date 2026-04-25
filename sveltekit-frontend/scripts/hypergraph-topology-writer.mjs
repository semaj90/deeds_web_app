#!/usr/bin/env node
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let Redis;
try { Redis = require('ioredis'); } catch (e) { Redis = null; }

function parseArgs() {
  const a = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--centroids') out.centroids = a[++i];
    else if (a[i] === '--redis') out.redis = a[++i];
    else if (a[i] === '--prefix') out.prefix = a[++i];
    else if (a[i] === '--k') out.k = Number(a[++i]);
    else if (a[i] === '--help') out.help = true;
  }
  return out;
}

function l2sq(a,b){ let s=0; for(let i=0;i<a.length;i++){ const d=a[i]-b[i]; s+=d*d;} return s; }

async function main(){
  const cfg = parseArgs();
  if (cfg.help || !cfg.centroids) { console.log('Usage: node hypergraph-topology-writer.mjs --centroids centroids.json --redis redis://127.0.0.1:6379 --k 16 --prefix hypergraph:v1'); process.exit(cfg.help?0:1); }
  const redisUrl = cfg.redis || null;
  const prefix = cfg.prefix || 'hypergraph:v1';
  const K = cfg.k || 16;

  let redisClient = null;
  if (redisUrl) {
    if (!Redis) console.warn('ioredis not available; topology writer will skip Redis writes.');
    else { redisClient = new Redis(redisUrl); redisClient.on('error', e=>console.warn('Redis error', e.message)); }
  }

  const raw = fs.readFileSync(cfg.centroids, 'utf8');
  const obj = JSON.parse(raw);
  const centroids = obj.centroids || obj.centroid || [];
  const dims = obj.dims || (centroids[0] && centroids[0].length) || 0;
  const n = centroids.length;
  console.log(`Loaded ${n} centroids (dims=${dims})`);

  // compute k-NN among centroids (naive O(n^2), OK for few thousands)
  const neighbors = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = centroids[i];
    const scores = [];
    for (let j = 0; j < n; j++) { if (i===j) continue; scores.push([j, l2sq(a, centroids[j])]); }
    scores.sort((x,y)=>x[1]-y[1]);
    neighbors[i] = scores.slice(0, Math.min(K, scores.length)).map(s=>({ id: s[0], dist: s[1] }));
  }

  if (redisClient) {
    const key = prefix + ':neighbors';
    const pipe = redisClient.pipeline();
    pipe.del(key);
    for (let i = 0; i < neighbors.length; i++) {
      pipe.hset(key, String(i), JSON.stringify(neighbors[i]));
    }
    pipe.expire(key, 60*60*24);
    pipe.publish(prefix + ':topology', JSON.stringify({ updatedAt: Date.now(), count: neighbors.length }));
    await pipe.exec();
    console.log(`Wrote neighbors to Redis key ${key}`);
    redisClient.disconnect();
  } else {
    // write local file
    const out = cfg.centroids.replace(/\.json$/, '') + '.neighbors.json';
    fs.writeFileSync(out, JSON.stringify({ neighbors }, null, 2));
    console.log('Wrote local neighbors file', out);
  }
}

main().catch(e=>{ console.error(e); process.exit(1); });
