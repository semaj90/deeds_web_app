#!/usr/bin/env node
/**
 * smoke-som-packet-crud.mjs
 * Validates SOM cluster packet store CRUD against live Redis.
 * Run: node scripts/smoke/smoke-som-packet-crud.mjs
 */

import Redis from 'ioredis';
import fs from 'node:fs';
import path from 'node:path';

function loadEnv() {
  const e = { ...process.env };
  const p = path.resolve(process.cwd(), 'sveltekit-frontend/.env');
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !e[m[1]]) e[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  const rootEnv = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(rootEnv)) {
    for (const line of fs.readFileSync(rootEnv, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !e[m[1]]) e[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return e;
}
const env = loadEnv();
const redis = new Redis({
  host: env.REDIS_HOST || '127.0.0.1',
  port: parseInt(env.REDIS_PORT || '6379', 10),
  password: env.REDIS_PASSWORD || undefined,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: () => null,
});
redis.on('error', () => {});

let pass = 0;
let fail = 0;

function ok(label) { console.log(`  ✓ ${label}`); pass++; }
function err(label, detail) { console.error(`  ✗ ${label}${detail ? ': ' + detail : ''}`); fail++; }

async function run() {
  console.log('\n── SOM Packet CRUD smoke ────────────────────────────────────');

  try {
    await redis.connect();
    await redis.ping();
    ok('Redis connected');
  } catch (e) {
    err('Redis connect', e.message);
    await redis.disconnect();
    process.exit(1);
  }

  const testRow = 19;
  const testCol = 18;
  const clusterId = `${testRow}:${testCol}`;
  const clusterKey = `ace:cluster:${testRow}:${testCol}`;

  // Check for existing SOM packets
  const indexSize = await redis.scard('ace:cluster:index');
  const rankSize = await redis.zcard('ace:cluster:rank');
  console.log(`  Found ${indexSize} clusters in index, ${rankSize} in rank ZSET`);
  if (indexSize > 0) ok('ace:cluster:index has entries (SOM loaded)');
  else err('ace:cluster:index empty', 'run graphify:semantic to load SOM clusters');

  // Write test cluster
  const somPacket = {
    cluster_id: clusterId,
    som_row: testRow,
    som_col: testCol,
    card_count: 1,
    candidate_count: 0,
    avg_som_dist: 0.05,
    top_keywords: ['smoke', 'test'],
    top_tags: ['test'],
    card_sample: [],
    feature_ids: ['feat:smoke'],
    source_refs: ['src/smoke/test.ts'],
    adjacent_clusters: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await redis.set(clusterKey, JSON.stringify(somPacket), 'EX', 120);
  await redis.zadd('ace:cluster:rank', 1, clusterId);
  await redis.sadd('ace:cluster:index', clusterId);

  // Read back
  const raw = await redis.get(clusterKey);
  if (raw) {
    const p = JSON.parse(raw);
    if (p.cluster_id === clusterId) ok('Write + read SOM packet');
    else err('Write + read SOM packet', 'cluster_id mismatch');
  } else {
    err('Write + read SOM packet', 'key missing');
  }

  // Rank ZSET
  const score = await redis.zscore('ace:cluster:rank', clusterId);
  if (score !== null) ok('ace:cluster:rank ZADD/ZSCORE');
  else err('ace:cluster:rank ZADD/ZSCORE', 'cluster not in rank ZSET');

  // Index SET
  const inIndex = await redis.sismember('ace:cluster:index', clusterId);
  if (inIndex) ok('ace:cluster:index SADD/SISMEMBER');
  else err('ace:cluster:index SADD/SISMEMBER', 'cluster not in index');

  // Top-N from rank
  const topIds = await redis.zrevrange('ace:cluster:rank', 0, 4);
  if (topIds.length > 0) ok(`ace:cluster:rank ZREVRANGE (${topIds.length} clusters)`);
  else err('ace:cluster:rank ZREVRANGE', 'no clusters returned');

  // Cleanup smoke data
  await redis.del(clusterKey);
  await redis.zrem('ace:cluster:rank', clusterId);
  await redis.srem('ace:cluster:index', clusterId);

  console.log(`\n  Result: ${pass} passed, ${fail} failed`);
  await redis.disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
