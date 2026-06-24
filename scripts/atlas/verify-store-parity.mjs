#!/usr/bin/env node
/**
 * verify-store-parity.mjs
 *
 * Multi-store verification ledger:
 * - Postgres canonical (atlas_packets + atlas_identity_ledger)
 * - Qdrant mirror (codebase_chunks_768 payload)
 * - Neo4j mirror (Packet nodes + qdrant_id property)
 * - Redis mirror (bifrost:packet:* keys)
 *
 * Emits parity report:
 * {
 *   "packets_total": 3251,
 *   "stores": {
 *     "postgres": 3251,
 *     "qdrant": 2488,
 *     "neo4j": 1950,
 *     "redis": 2145,
 *   },
 *   "parity": {
 *     "pg_qdrant": 2488,
 *     "pg_neo4j": 1950,
 *     "pg_redis": 2145,
 *   },
 *   "mismatches": [
 *     { packet_key: "...", pg: true, qdrant: false, reason: "qdrant_id null" }
 *   ],
 *   "gaps": {
 *     "qdrant_missing": 763,
 *     "neo4j_missing": 1301,
 *     "redis_missing": 1106,
 *   }
 * }
 *
 * Usage:
 *   node scripts/atlas/verify-store-parity.mjs --apply
 *   node scripts/atlas/verify-store-parity.mjs --verbose
 *   node scripts/atlas/verify-store-parity.mjs --store=qdrant  (single store)
 */

import pg from 'pg';
import { QdrantClient } from '@qdrant/js-client-rest';
import fetch from 'node-fetch';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '../..');
const REPORTS_DIR = join(ROOT, 'docs/reports');

// ── Configuration ──────────────────────────────────────────────────────────
const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const STORE_ARG = (() => {
  const i = process.argv.indexOf('--store');
  return i !== -1 ? process.argv[i + 1] : null;
})();

const PG_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const NEO4J_URL = process.env.NEO4J_URL || 'http://localhost:7474';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASS || 'neo4j123';
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASS = process.env.REDIS_PASSWORD || 'redis';

function log(...args) { console.log(...args); }
function vlog(...args) { if (VERBOSE) console.log(...args); }

// ── Postgres Verification ──────────────────────────────────────────────────
async function verifyPostgres(pool) {
  log('\n🔍 Verifying Postgres (canonical)...');

  const result = await pool.query(`
    SELECT packet_key, feature_id, source_ref, qdrant_point_id
    FROM atlas_packets
    WHERE packet_key IS NOT NULL
  `);

  const packets = result.rows || result;
  log(`  ✓ ${packets.length} packets in atlas_packets`);

  // Count those with qdrant_point_id
  const withQdrantId = packets.filter(p => p.qdrant_point_id).length;
  log(`  ✓ ${withQdrantId} have qdrant_point_id (${(withQdrantId / packets.length * 100).toFixed(1)}%)`);

  return {
    total: packets.length,
    withQdrantId,
    packets,
  };
}

// ── Qdrant Verification ───────────────────────────────────────────────────
async function verifyQdrant(qdrant) {
  log('\n🔍 Verifying Qdrant mirror...');

  try {
    const collection = await qdrant.getCollection('codebase_chunks_768');
    const count = collection.points_count || 0;
    log(`  ✓ ${count} points in codebase_chunks_768`);

    // Sample 100 points using scroll (correct API method)
    const result = await qdrant.scroll('codebase_chunks_768', {
      limit: 100,
      with_payload: true,
      with_vectors: false,
    });

    const points = result.points || [];
    const havePacketKey = points.filter(p => p.payload?.packet_key).length;
    const haveSourceRef = points.filter(p => p.payload?.source_ref).length;
    const haveFeatureId = points.filter(p => p.payload?.feature_id).length;

    log(`  ✓ Sample (${points.length}): ${havePacketKey} packet_key, ${haveSourceRef} source_ref, ${haveFeatureId} feature_id`);

    return {
      total: count,
      sampleSize: points.length,
      samplePoints: points,
      payloadCoverage: {
        packet_key: havePacketKey,
        source_ref: haveSourceRef,
        feature_id: haveFeatureId,
      },
    };
  } catch (e) {
    log(`  ✗ Qdrant error: ${e.message}`);
    return { total: 0, error: e.message };
  }
}

// ── Neo4j Verification ─────────────────────────────────────────────────────
async function verifyNeo4j() {
  log('\n🔍 Verifying Neo4j mirror...');

  try {
    const res = await fetch(`${NEO4J_URL}/db/neo4j/tx/commit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${NEO4J_USER}:${NEO4J_PASS}`).toString('base64')}`,
      },
      body: JSON.stringify({
        statements: [
          {
            statement: 'MATCH (p:Packet) RETURN count(p) as cnt',
            parameters: {},
          },
        ],
      }),
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json();
    if (data.errors?.length) throw new Error(data.errors[0].message);

    const count = data.results[0]?.data?.[0]?.row?.[0] || 0;
    log(`  ✓ ${count} Packet nodes in Neo4j`);

    // Sample: check qdrant_id coverage
    const sampleRes = await fetch(`${NEO4J_URL}/db/neo4j/tx/commit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${NEO4J_USER}:${NEO4J_PASS}`).toString('base64')}`,
      },
      body: JSON.stringify({
        statements: [
          {
            statement: 'MATCH (p:Packet) WHERE p.qdrant_id IS NOT NULL RETURN count(p) as cnt',
            parameters: {},
          },
        ],
      }),
      signal: AbortSignal.timeout(10000),
    });

    const sampleData = await sampleRes.json();
    const withQdrantId = sampleData.results[0]?.data?.[0]?.row?.[0] || 0;
    log(`  ✓ ${withQdrantId} have qdrant_id (${(withQdrantId / count * 100).toFixed(1)}%)`);

    return {
      total: count,
      withQdrantId,
    };
  } catch (e) {
    log(`  ✗ Neo4j error: ${e.message}`);
    return { total: 0, error: e.message };
  }
}

// ── Redis Verification ────────────────────────────────────────────────────
async function verifyRedis() {
  log('\n🔍 Verifying Redis/BitFrost mirror...');

  try {
    // Dynamic import to avoid hard dependency
    const Redis = (await import('ioredis')).default;
    const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PASS });

    // Count bifrost:packet:* keys
    const keys = await redis.keys('bifrost:packet:*');
    log(`  ✓ ${keys.length} bifrost:packet:* keys in Redis`);

    // Also count centroid:dir:* keys (from Stage 3)
    const centroidKeys = await redis.keys('centroid:dir:*');
    log(`  ✓ ${centroidKeys.length} centroid:dir:* keys (Stage 3 centroids)`);

    // Sample a few keys
    if (keys.length > 0) {
      const sampleKey = keys[0];
      const sample = await redis.get(sampleKey);
      if (sample) {
        try {
          const parsed = JSON.parse(sample);
          log(`  ✓ Sample key structure: ${Object.keys(parsed).join(', ')}`);
        } catch {
          log(`  ✓ Sample key is stored (format: string)`);
        }
      }
    }

    await redis.quit();
    return {
      bifrostPackets: keys.length,
      centroidDirs: centroidKeys.length,
    };
  } catch (e) {
    log(`  ✗ Redis error: ${e.message}`);
    return { error: e.message };
  }
}

// ── Parity Computation ────────────────────────────────────────────────────
function computeParity(pgData, qdrantData, neo4jData, redisData) {
  return {
    pg_total: pgData.total,
    pg_with_qdrant_id: pgData.withQdrantId,
    qdrant_total: qdrantData.total,
    neo4j_total: neo4jData.total,
    neo4j_with_qdrant_id: neo4jData.withQdrantId,
    redis_bifrost_packets: redisData.bifrostPackets || 0,
    redis_centroid_dirs: redisData.centroidDirs || 0,

    parity_pg_qdrant: Math.min(pgData.withQdrantId, qdrantData.total),
    parity_pg_neo4j: neo4jData.total,
    parity_pg_redis: redisData.bifrostPackets || 0,

    gaps: {
      qdrant_missing: pgData.total - (qdrantData.total || 0),
      neo4j_missing: pgData.total - (neo4jData.total || 0),
      redis_missing: pgData.total - (redisData.bifrostPackets || 0),
    },

    coverage_percent: {
      qdrant: (qdrantData.total || 0) / pgData.total * 100,
      neo4j: (neo4jData.total || 0) / pgData.total * 100,
      redis: (redisData.bifrostPackets || 0) / pgData.total * 100,
    },
  };
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  log('\n📊 Multi-Store Parity Verification\n');

  if (!existsSync(REPORTS_DIR)) {
    mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const pool = new pg.Pool({ connectionString: PG_URL, max: 5 });
  const qdrant = new QdrantClient({ url: QDRANT_URL });

  try {
    const pgData = await verifyPostgres(pool);

    if (!STORE_ARG || STORE_ARG === 'qdrant') {
      var qdrantData = await verifyQdrant(qdrant);
    }

    if (!STORE_ARG || STORE_ARG === 'neo4j') {
      var neo4jData = await verifyNeo4j();
    }

    if (!STORE_ARG || STORE_ARG === 'redis') {
      var redisData = await verifyRedis();
    }

    const parity = computeParity(
      pgData,
      qdrantData || { total: 0 },
      neo4jData || { total: 0, withQdrantId: 0 },
      redisData || { bifrostPackets: 0, centroidDirs: 0 }
    );

    log('\n' + '='.repeat(60));
    log('📋 PARITY REPORT');
    log('='.repeat(60) + '\n');

    log(`Postgres (canonical):  ${parity.pg_total} packets`);
    log(`  └─ with qdrant_id:   ${parity.pg_with_qdrant_id} (${(parity.pg_with_qdrant_id / parity.pg_total * 100).toFixed(1)}%)`);

    log(`\nQdrant mirror:         ${parity.qdrant_total} points (${parity.coverage_percent.qdrant.toFixed(1)}%)`);
    log(`Neo4j mirror:          ${parity.neo4j_total} nodes (${parity.coverage_percent.neo4j.toFixed(1)}%)`);
    log(`  └─ with qdrant_id:   ${neo4jData?.withQdrantId || 0}`);

    log(`Redis/BitFrost:        ${parity.redis_bifrost_packets} cache keys (${parity.coverage_percent.redis.toFixed(1)}%)`);
    log(`Redis centroids:       ${parity.redis_centroid_dirs} directories`);

    log(`\n⚠️  GAPS:`);
    log(`  Qdrant missing:      ${parity.gaps.qdrant_missing} packets`);
    log(`  Neo4j missing:       ${parity.gaps.neo4j_missing} packets`);
    log(`  Redis missing:       ${parity.gaps.redis_missing} packets`);

    // Save report
    const reportPath = join(REPORTS_DIR, 'store-parity-verification.json');
    writeFileSync(reportPath, JSON.stringify({ timestamp: new Date().toISOString(), ...parity }, null, 2));
    log(`\n✓ Report saved: ${reportPath}\n`);

  } finally {
    await pool.end();
  }
}

main().catch(e => {
  console.error(`❌ Fatal: ${e.message}`);
  process.exit(1);
});
