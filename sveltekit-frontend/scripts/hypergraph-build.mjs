#!/usr/bin/env node
/* Streaming hypergraph builder (placed in sveltekit-frontend/scripts)
   See README-HYPERGRAPH.md for usage.
*/
import fs from 'fs';
import readline from 'readline';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let Redis;
try { Redis = require('ioredis'); } catch (e) { Redis = null; }

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--input') out.input = args[++i];
    else if (a === '--clusters') out.k = Number(args[++i]);
    else if (a === '--batch-size') out.batchSize = Number(args[++i]);
    else if (a === '--redis') out.redis = args[++i];
    else if (a === '--prefix') out.prefix = args[++i];
    else if (a === '--out') out.out = args[++i];
    else if (a === '--assignments') out.assignments = args[++i];
    else if (a === '--checkpoint-every') out.checkpointEvery = Number(args[++i]);
    else if (a === '--help') out.help = true;
  }
  return out;
}

function l2sq(a, b) { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return s; }
function addScaled(dest, src, alpha) { for (let i = 0; i < dest.length; i++) dest[i] += alpha * (src[i] - dest[i]); }

async function main() {
  const cfg = parseArgs();
  if (cfg.help || !cfg.input) { console.log('Usage: node scripts/hypergraph-build.mjs --input embeddings.ndjson --clusters 100 --out centroids.json --assignments assignments.ndjson'); process.exit(cfg.help?0:1); }
  const K = cfg.k || 100;
  const checkpointEvery = cfg.checkpointEvery || 1000;
  const redisUrl = cfg.redis || null;
  const prefix = cfg.prefix || 'hypergraph:v1';

  let redisClient = null;
  if (redisUrl) {
    if (!Redis) console.warn('ioredis not available; skipping Redis checkpointing.');
    else { redisClient = new Redis(redisUrl); redisClient.on('error', e => console.warn('Redis error', e.message)); }
  }

  const rl = readline.createInterface({ input: fs.createReadStream(cfg.input), crlfDelay: Infinity });
  let centroids = [], counts = [], dims = null, processed = 0;
  const assignmentsStream = cfg.assignments ? fs.createWriteStream(cfg.assignments, { flags: 'w' }) : null;

  for await (const line of rl) {
    if (!line.trim()) continue;
    let obj; try { obj = JSON.parse(line); } catch (e) { console.warn('Skipping invalid JSON line'); continue; }
    const vec = obj.embedding || obj.vec || obj.vector; const id = obj.id || processed;
    if (!vec || !Array.isArray(vec)) { console.warn('Skipping line with no embedding'); continue; }
    if (dims === null) dims = vec.length;
    if (centroids.length < K) { centroids.push(Float64Array.from(vec)); counts.push(1); if (assignmentsStream) assignmentsStream.write(JSON.stringify({ id, centroid: centroids.length - 1 }) + '\n'); processed++; continue; }
    let best = 0; let bestDist = l2sq(vec, centroids[0]);
    for (let i = 1; i < centroids.length; i++) { const d = l2sq(vec, centroids[i]); if (d < bestDist) { bestDist = d; best = i; } }
    const lr = 1 / (++counts[best]); addScaled(centroids[best], vec, lr);
    if (assignmentsStream) assignmentsStream.write(JSON.stringify({ id, centroid: best }) + '\n');
    processed++;
    if (processed % checkpointEvery === 0) {
      console.log(`Processed ${processed} vectors — checkpointing centroids to Redis`);
      if (redisClient) {
        try {
          const key = prefix + ':centroids';
          const meta = JSON.stringify({ K: centroids.length, dims, counts, updatedAt: Date.now(), processed });
          const pipe = redisClient.pipeline();
          pipe.hset(key, 'meta', meta);
          for (let i = 0; i < centroids.length; i++) {
            pipe.hset(key, String(i), JSON.stringify({ count: counts[i], vector: Array.from(centroids[i]) }));
          }
          pipe.expire(key, 60 * 60 * 24);
          pipe.publish(prefix + ':checkpoint', meta);
          await pipe.exec();
        } catch (e) { console.warn('Redis checkpoint failed', e.message); }
      }
    }
  }

  console.log(`Finished processing ${processed} vectors`);
  if (redisClient) {
    try {
      const key = prefix + ':centroids';
      const meta = JSON.stringify({ K: centroids.length, dims, counts, updatedAt: Date.now(), processed });
      const pipe = redisClient.pipeline();
      pipe.hset(key, 'meta', meta);
      for (let i = 0; i < centroids.length; i++) {
        pipe.hset(key, String(i), JSON.stringify({ count: counts[i], vector: Array.from(centroids[i]) }));
      }
      pipe.expire(key, 60 * 60 * 24);
      pipe.publish(prefix + ':checkpoint', meta);
      await pipe.exec();
    } catch (e) { console.warn('Redis set failed', e.message); }
    redisClient.disconnect();
  }
  if (cfg.out) { const outObj = { K: centroids.length, dims, counts, centroids: centroids.map(c=>Array.from(c)) }; fs.writeFileSync(cfg.out, JSON.stringify(outObj, null, 2)); console.log('Wrote centroids to', cfg.out); }
  if (assignmentsStream) assignmentsStream.end();
}

main().catch(err => { console.error(err); process.exit(1); });
