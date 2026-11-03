#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import IORedis from 'ioredis';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

import { loadRepoEnv, resolveRedisConfig } from '../atlas/connection-config.mjs';
import { countNeo4jRelationship } from '../atlas/lib/neo4j-http.mjs';
import { writeLaneReportV1 } from './lane-report-v1.mjs';

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const COLLECTION = 'codebase_chunks_768';

async function scanCount(client, pattern, maxPages = 100) {
  let cursor = '0';
  let count = 0;
  let pages = 0;
  do {
    const result = await client.scan(cursor, 'MATCH', pattern, 'COUNT', '1000');
    cursor = String(result[0]);
    count += result[1].length;
    pages += 1;
  } while (cursor !== '0' && pages < maxPages);
  return { count, complete: cursor === '0', pages };
}

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
      status: missingRequired > 0 ? 'FAIL' : points.length === 0 ? 'BLOCKED' : 'PASS',
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
    report.checks.qdrant_payload = { status: 'PARTIAL', detail: err.message };
    console.log(`  ⚠️  Qdrant payload check blocked: ${err.message}`);
  }

  // 2. Query Valkey/Redis cache
  console.log('\n2. Querying Valkey/Redis active cache keys…');
  const env = loadRepoEnv(process.env);
  const redisConfig = resolveRedisConfig(env);
  let client;
  try {
    client = new IORedis.default({
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

    const rewardKeys = await scanCount(client, 'reward:*');
    const centroidKeys = await scanCount(client, 'centroid:*');
    const semanticKeys = await scanCount(client, 'semantic:*');
    const allKeys = await scanCount(client, '*');

    await client.quit().catch(() => {});

    report.checks.redis_cache = {
      status: [rewardKeys, centroidKeys, semanticKeys, allKeys].every((result) => result.complete) ? 'PASS' : 'BLOCKED',
      detail: {
        total_keys: allKeys.count,
        reward_keys: rewardKeys.count,
        centroid_keys: centroidKeys.count,
        semantic_keys: semanticKeys.count,
        bounded_scan_pages: { all: allKeys.pages, reward: rewardKeys.pages, centroid: centroidKeys.pages, semantic: semanticKeys.pages },
        scan_complete: [rewardKeys, centroidKeys, semanticKeys, allKeys].every((result) => result.complete),
      }
    };
    console.log(`  ${report.checks.redis_cache.status === 'PASS' ? '✅' : '⚠️'} Valkey scan ${report.checks.redis_cache.status.toLowerCase()}. Total keys: ${allKeys.count}. Rewards: ${rewardKeys.count}. Centroids: ${centroidKeys.count}.`);
  } catch (err) {
    report.checks.redis_cache = { status: 'PARTIAL', detail: err.message };
    console.log(`  ⚠️  Valkey check degraded: ${err.message}`);
  } finally {
    await client?.quit().catch(() => {});
  }

  // 3. Query Neo4j relationship paths
  console.log('\n3. Querying Neo4j relationship paths…');
  try {
    const neo4jResponse = await countNeo4jRelationship({ relationshipType: 'USED_CONCEPT' });

    if (neo4jResponse && neo4jResponse.ok) {
      const hasValidCount = neo4jResponse.columns?.includes('count')
        && neo4jResponse.rows?.length === 1
        && Number.isSafeInteger(neo4jResponse.count);
      if (!hasValidCount) {
        report.checks.neo4j_relations = {
          status: 'BLOCKED',
          detail: { reason: 'MALFORMED_NEO4J_COUNT_RESPONSE' },
        };
        console.log('  ⚠️ Neo4j count response did not match the expected schema.');
      } else {
        const results = neo4jResponse.count;
      report.checks.neo4j_relations = {
        status: Number(results) > 0 ? 'PASS' : 'BLOCKED',
        detail: { used_concept_count: results }
      };
        console.log(`  ${Number(results) > 0 ? '✅' : '⚠️'} Neo4j USED_CONCEPT edge count = ${results}.`);
      }
    } else {
      const errDetail = neo4jResponse?.error || 'Unknown HTTP query error';
      report.checks.neo4j_relations = { status: 'PARTIAL', detail: errDetail };
      console.log(`  ⚠️  Neo4j check degraded: ${errDetail}`);
    }
  } catch (err) {
    report.checks.neo4j_relations = { status: 'PARTIAL', detail: err.message };
    console.log(`  ⚠️  Neo4j check degraded: ${err.message}`);
  }

  const checkStatuses = Object.values(report.checks).map((check) => check.status);
  report.status = hasFailures || checkStatuses.includes('FAIL')
    ? 'FAIL'
    : checkStatuses.length > 0 && checkStatuses.every((status) => status === 'PASS')
      ? 'PASS'
      : 'PARTIAL';
  if (report.status !== 'PASS') process.exitCode = 1;

  // Save report
  const reportPath = writeLaneReportV1('atlas', report);
  console.log(`\nParent Atlas traversal lane report saved to ${path.relative(ROOT, reportPath)} with status: ${report.status}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
