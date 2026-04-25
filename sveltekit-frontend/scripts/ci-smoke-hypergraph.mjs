#!/usr/bin/env node
import { spawnSync } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const REDIS = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const PREFIX = process.env.HG_PREFIX || 'hypergraph:v1';

async function checkRedis() {
  let Redis;
  try { Redis = require('ioredis'); } catch (e) { console.error('ioredis not installed; cannot verify Redis keys.'); process.exit(2); }
  const client = new Redis(REDIS);
  try {
    const centroidsKey = PREFIX + ':centroids';
    const neighborsKey = PREFIX + ':neighbors';
    const c = await client.exists(centroidsKey);
    const n = await client.exists(neighborsKey);
    console.log('Redis check:', centroidsKey, 'exists=', c, neighborsKey, 'exists=', n);
    await client.disconnect();
    if (c && n) return 0;
    return 3;
  } catch (e) {
    console.error('Redis check failed', e.message);
    await client.disconnect();
    return 4;
  }
}

function run(cmd, args, opts = {}) {
  console.log('RUN:', cmd, args.join(' '));
  const res = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (res.status !== 0) {
    console.error('Command failed:', cmd, args.join(' '));
    process.exit(res.status || 1);
  }
}

async function main() {
  fs.mkdirSync('sveltekit-frontend/tmp', { recursive: true });
  // Generate smoke embeddings
  run('node', ['./sveltekit-frontend/scripts/generate-smoke-embeddings.mjs']);

  // Build hypergraph with Redis checkpointing
  run('node', ['./sveltekit-frontend/scripts/hypergraph-build.mjs', '--input', './sveltekit-frontend/tmp/embeddings-smoke.ndjson', '--clusters', '50', '--redis', REDIS, '--checkpoint-every', '100', '--out', './sveltekit-frontend/tmp/centroids-ci.json', '--assignments', './sveltekit-frontend/tmp/assignments-ci.ndjson']);

  // Write topology into Redis
  run('node', ['./sveltekit-frontend/scripts/hypergraph-topology-writer.mjs', '--centroids', './sveltekit-frontend/tmp/centroids-ci.json', '--redis', REDIS, '--k', '16', '--prefix', PREFIX]);

  const rc = await checkRedis();
  if (rc !== 0) { console.error('CI smoke: Redis verification failed'); process.exit(rc); }
  console.log('CI smoke succeeded');
}

main().catch(e => { console.error(e); process.exit(1); });
