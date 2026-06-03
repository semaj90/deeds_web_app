#!/usr/bin/env node
/**
 * smoke-ace-packet-crud.mjs
 * Validates ACE packet store CRUD operations against live Redis.
 * Run: node scripts/smoke/smoke-ace-packet-crud.mjs
 */

import Redis from 'ioredis';
import fs from 'node:fs';
import crypto from 'node:crypto';
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

function ok(label) {
  console.log(`  ✓ ${label}`);
  pass++;
}
function err(label, detail) {
  console.error(`  ✗ ${label}${detail ? ': ' + detail : ''}`);
  fail++;
}

function makeTestPacketId() {
  return 'smoke_' + crypto.randomBytes(6).toString('hex');
}

async function run() {
  console.log('\n── ACE Packet CRUD smoke ────────────────────────────────────');

  try {
    await redis.connect();
    await redis.ping();
    ok('Redis connected');
  } catch (e) {
    err('Redis connect', e.message);
    await redis.disconnect();
    process.exit(1);
  }

  const packetId = makeTestPacketId();
  const sourceRef = `src/smoke/test-${packetId}.ts`;
  const featureId = `feat:smoke-${packetId}`;
  const clusterKey = `ace:packet:${packetId}`;
  const sourceRefHash = crypto.createHash('sha256').update(sourceRef).digest('hex').slice(0, 8);
  const sourceRefKey = `ace:source_ref:${sourceRefHash}`;

  // Write
  const packetJson = JSON.stringify({
    packet_id: packetId,
    query: 'smoke test query',
    query_hash: 'smoke0000',
    source_refs: [sourceRef],
    feature_ids: [featureId],
    lane_ids: ['smoke'],
    cluster_id: '5:3',
    workspace_task_id: null,
    qdrant_point_ids: [],
    neo4j_neighbor_ids: [],
    redis_hot_keys: [],
    prompt_context: 'Smoke test context.',
    ranked_cards: [{ source_ref: sourceRef, score: 0.9, feature_id: featureId, snippet: 'smoke' }],
    cache_hit: 'none',
    latency_ms: 0,
    degraded: false,
    created_at: new Date().toISOString(),
    ttl_seconds: 120,
  });

  await redis.set(clusterKey, packetJson, 'EX', 120);
  await redis.set(sourceRefKey, packetId, 'EX', 120);

  // Read by ID
  const raw = await redis.get(clusterKey);
  if (raw) {
    const p = JSON.parse(raw);
    if (p.packet_id === packetId) ok('Write + read by packet_id');
    else err('Write + read by packet_id', 'packet_id mismatch');
  } else {
    err('Write + read by packet_id', 'key missing');
  }

  // Read by source_ref index
  const idFromRef = await redis.get(sourceRefKey);
  if (idFromRef === packetId) ok('source_ref index lookup');
  else err('source_ref index lookup', `got ${idFromRef}`);

  // Read latest pointer
  await redis.set('ace:packet:latest', packetId, 'EX', 120);
  const latestId = await redis.get('ace:packet:latest');
  if (latestId === packetId) ok('ace:packet:latest write/read');
  else err('ace:packet:latest write/read', `got ${latestId}`);

  // Cluster key
  const clusterPacketKey = `ace:cluster:5:3`;
  await redis.set(clusterPacketKey, packetJson, 'EX', 120);
  const fromCluster = await redis.get(clusterPacketKey);
  if (fromCluster) ok('ace:cluster:<row>:<col> write/read');
  else err('ace:cluster:<row>:<col> write/read', 'key missing');

  // Feature list
  const featureKey = `ace:feature:${featureId}`;
  await redis.lpush(featureKey, packetId);
  await redis.expire(featureKey, 120);
  const featureList = await redis.lrange(featureKey, 0, 0);
  if (featureList[0] === packetId) ok('ace:feature:<id> LPUSH/LRANGE');
  else err('ace:feature:<id> LPUSH/LRANGE', `got ${featureList}`);

  // Cleanup
  await redis.del(clusterKey, sourceRefKey, clusterPacketKey, featureKey);

  console.log(`\n  Result: ${pass} passed, ${fail} failed`);
  await redis.disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
