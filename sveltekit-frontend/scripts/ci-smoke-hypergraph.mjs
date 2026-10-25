#!/usr/bin/env node
/**
 * ci-smoke-hypergraph.mjs
 *
 * Validates the full hypergraph pipeline end-to-end:
 *   1. Generate smoke embeddings (synthetic 768-dim vectors)
 *   2. GPU k-means clustering → centroids + assignments
 *   3. Write hypergraph:v1 topology (centroids + k-NN neighbors) to Redis
 *   4. Dry-run Qdrant tagging for codebase_chunks_768 + evidence_items
 *   5. Verify hypergraph:v1 Redis keys (CI namespace)
 *   6. Verify hg:edge:idx (production namespace from run-hypergraph.ts)
 *
 * Key namespaces:
 *   CI:         hypergraph:v1:centroids, hypergraph:v1:neighbors
 *   Production: hg:edge:idx, hg:built_at, hg:edge:{hash}
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const REDIS = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const REDIS_PASS = process.env.REDIS_PASSWORD || 'redis';
const PREFIX = process.env.HG_PREFIX || 'hypergraph:v1';
if (PREFIX === 'hg' || PREFIX.startsWith('hg:')) {
  throw new Error('CI_HYPERGRAPH_PREFIX_MUST_NOT_OVERLAP_PRODUCTION_NAMESPACE');
}

async function checkRedis() {
  let Redis;
  try { Redis = require('ioredis'); } catch {
    console.error('ioredis not installed; cannot verify Redis keys.');
    process.exit(2);
  }
  const client = new Redis(REDIS, { password: REDIS_PASS, lazyConnect: true });
  try {
    await client.ping();

    // CI namespace (hypergraph:v1)
    const centroidsKey = PREFIX + ':centroids';
    const neighborsKey = PREFIX + ':neighbors';
    const c = await client.exists(centroidsKey);
    const n = await client.exists(neighborsKey);
    console.log('Redis CI keys:', centroidsKey, 'exists=', c, neighborsKey, 'exists=', n);

    // Production namespace is inspected only; CI must not manufacture production edges.
    const edgeCount = await client.zcard('hg:edge:idx');
    const edgeIds = await client.zrevrange('hg:edge:idx', 0, 49);
    const edgeBlobs = await Promise.all(edgeIds.map((id) => client.get(`hg:edge:${id}`)));
    const edgeOk = edgeBlobs.some((blob) => {
      if (!blob) return false;
      try {
        const edge = JSON.parse(blob);
        return Array.isArray(edge?.memberIds) && typeof edge?.gradeLabel === 'string';
      } catch {
        return false;
      }
    });

    const builtAt = await client.get('hg:built_at');
    console.log('Redis prod keys: hg:edge:idx size=', edgeCount, 'hg:built_at=', builtAt ?? '(standalone pipeline not run yet)');
    console.log('Redis prod key shape (ACE readable):', edgeOk ? 'OK ✓' : 'FAIL — no valid production edge found');

    await client.disconnect();
    if (c && n && edgeOk) return 0;
    if (!edgeOk) {
      console.error('CI smoke: hg:edge:* has no valid production edge — topological-search.ts has no real hyperedge data to read');
      return 5;
    }
    return 3;
  } catch (e) {
    console.error('Redis check failed:', e.message);
    try { await client.disconnect(); } catch { /* noop */ }
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
  // Run from workspace root (deeds-web-app/) or sveltekit-frontend/ — handle both
  const inFrontend = fs.existsSync('scripts/generate-smoke-embeddings.mjs');
  const scriptBase = inFrontend ? './scripts' : './sveltekit-frontend/scripts';
  const tmpBase = inFrontend ? './tmp' : './sveltekit-frontend/tmp';

  fs.mkdirSync(tmpBase, { recursive: true });

  // 1. Generate smoke embeddings
  run('node', [`${scriptBase}/generate-smoke-embeddings.mjs`]);

  // 2. Build hypergraph with Redis checkpointing
  run('node', [
    `${scriptBase}/hypergraph-build.mjs`,
    '--input', `${tmpBase}/embeddings-smoke.ndjson`,
    '--clusters', '50',
    '--redis', REDIS,
    '--checkpoint-every', '100',
    '--out', `${tmpBase}/centroids-ci.json`,
    '--assignments', `${tmpBase}/assignments-ci.ndjson`,
  ]);

  // 3. Write topology into Redis (hypergraph:v1 namespace)
  run('node', [
    `${scriptBase}/hypergraph-topology-writer.mjs`,
    '--centroids', `${tmpBase}/centroids-ci.json`,
    '--redis', REDIS,
    '--k', '16',
    '--prefix', PREFIX,
  ]);

  // 4a. Dry-run Qdrant tagging for codebase_chunks_768 (primary production collection)
  run('node', [
    `${scriptBase}/hypergraph-tag-qdrant.mjs`,
    '--assignments', `${tmpBase}/assignments-ci.ndjson`,
    '--collection', 'codebase_chunks_768',
    '--dry-run',
  ]);

  // 4b. Dry-run Qdrant tagging for evidence_items (secondary collection)
  run('node', [
    `${scriptBase}/hypergraph-tag-qdrant.mjs`,
    '--assignments', `${tmpBase}/assignments-ci.ndjson`,
    '--collection', 'evidence_items',
    '--dry-run',
  ]);

  // 5+6. Verify Redis keys (CI namespace required; prod namespace informational)
  const rc = await checkRedis();
  if (rc !== 0) {
    console.error('CI smoke: Redis verification failed (exit', rc, ')');
    process.exit(rc);
  }
  console.log('CI smoke: PASSED ✓');
}

main().catch(e => { console.error(e); process.exit(1); });
