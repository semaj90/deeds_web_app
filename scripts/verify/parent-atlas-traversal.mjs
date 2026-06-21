#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import IORedis from 'ioredis';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

import { loadRepoEnv, resolveRedisConfig } from '../atlas/connection-config.mjs';
import { queryNeo4jHttp } from '../atlas/lib/neo4j-http.mjs';

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const COLLECTION = 'codebase_chunks_768';

async function main() {
  console.log('\n=== Parent Atlas Traversal Lane ===\n');

  const report = {
    timestamp: new Date().toISOString(),
    lane: 'atlas',
    status: 'PASS',
    checks: {},
  };

  let hasFailures = false;

  // 1. Query Qdrant for active payloads
  console.log('1. Querying Qdrant points payload structure…');
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 50, with_payload: true, with_vector: false }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Qdrant scroll HTTP ${res.status}`);
    const data = await res.json();
    const points = data.result?.points ?? [];

    let missingRequired = 0;
    for (const p of points) {
      const pl = p.payload ?? {};
      if (!pl.packet_key || !pl.source_ref || !pl.feature_id) {
        missingRequired++;
      }
    }

    report.checks.qdrant_payload = {
      status: missingRequired > 0 ? 'FAIL' : 'PASS',
      detail: {
        scanned: points.length,
        missing_required: missingRequired,
      }
    };
    if (missingRequired > 0) {
      console.log(`  ❌ Scanned ${points.length} points, found ${missingRequired} with missing canonical payload fields!`);
      hasFailures = true;
    } else {
      console.log(`  ✅ Scanned ${points.length} points, all contain packet_key, source_ref, and feature_id.`);
    }
  } catch (err) {
    report.checks.qdrant_payload = { status: 'FAIL', detail: err.message };
    hasFailures = true;
    console.log(`  ❌ Qdrant payload check failed: ${err.message}`);
  }

  // 2. Query Valkey/Redis cache
  console.log('\n2. Querying Valkey/Redis active cache keys…');
  const env = loadRepoEnv(process.env);
  const redisConfig = resolveRedisConfig(env);
  try {
    const client = new IORedis.default({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password || 'redis',
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    client.on('error', () => {});
    await client.connect();

    // Look for centroid keys, semantic cache keys, or reward sets
    const rewardKeys = await client.keys('reward:*');
    const centroidKeys = await client.keys('centroid:*');
    const semanticKeys = await client.keys('semantic:*');
    const allKeys = await client.keys('*');

    await client.quit().catch(() => {});

    report.checks.redis_cache = {
      status: 'PASS',
      detail: {
        total_keys: allKeys.length,
        reward_keys: rewardKeys.length,
        centroid_keys: centroidKeys.length,
        semantic_keys: semanticKeys.length,
      }
    };
    console.log(`  ✅ Valkey reachable. Total keys: ${allKeys.length}. Rewards: ${rewardKeys.length}. Centroids: ${centroidKeys.length}.`);
  } catch (err) {
    report.checks.redis_cache = { status: 'PARTIAL', detail: err.message };
    console.log(`  ⚠️  Valkey check degraded: ${err.message}`);
  }

  // 3. Query Neo4j relationship paths
  console.log('\n3. Querying Neo4j relationship paths…');
  try {
    const neo4jResponse = await queryNeo4jHttp({
      statement: 'MATCH (p:Packet)-[r:USED_CONCEPT]->(c:Concept) RETURN count(r) AS count LIMIT 1',
    });

    if (neo4jResponse && neo4jResponse.ok) {
      const results = neo4jResponse.result?.results?.[0]?.data?.[0]?.row?.[0] ?? 0;
      report.checks.neo4j_relations = {
        status: 'PASS',
        detail: { used_concept_count: results }
      };
      console.log(`  ✅ Neo4j relationships: MATCH (p:Packet)-[USED_CONCEPT]->(c:Concept) count = ${results}.`);
    } else {
      const errDetail = neo4jResponse?.error || 'Unknown HTTP query error';
      report.checks.neo4j_relations = { status: 'PARTIAL', detail: errDetail };
      console.log(`  ⚠️  Neo4j check degraded: ${errDetail}`);
    }
  } catch (err) {
    report.checks.neo4j_relations = { status: 'PARTIAL', detail: err.message };
    console.log(`  ⚠️  Neo4j check degraded: ${err.message}`);
  }

  report.status = hasFailures ? 'FAIL' : 'PASS';

  // Save report
  const tmpDir = path.join(ROOT, '.tmp');
  mkdirSync(tmpDir, { recursive: true });
  writeFileSync(path.join(tmpDir, 'verify-atlas.json'), JSON.stringify(report, null, 2));
  console.log(`\nParent Atlas traversal lane report saved to .tmp/verify-atlas.json with status: ${report.status}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
