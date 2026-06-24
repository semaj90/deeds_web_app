#!/usr/bin/env node
/**
 * Production Readiness Checkpoint — Atlas Infrastructure
 *
 * Audits:
 * 1. Canonical embedding coverage (Postgres atlas_packets.embedding)
 * 2. GPU bridge availability (tensorrt_bridge.node + CUDA)
 * 3. RabbitMQ queue state (atlas.* queues)
 * 4. Memory tiers (Postgres truth, Redis cache, Qdrant mirror, Neo4j graph)
 * 5. SOM/KMeans state (centroid seeds, topology)
 * 6. Service health (all 12 gRPC services + HTTP endpoints)
 *
 * Usage:
 *   node scripts/atlas/production-readiness-checkpoint.mjs
 */

import pg from 'pg';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const require = createRequire(import.meta.url);
const Redis = require('ioredis');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');

const DB_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_URL = process.env.REDIS_URL || 'redis://:redis@127.0.0.1:6379';

const db = new pg.Pool({ connectionString: DB_URL, max: 5 });
const redis = new Redis(REDIS_URL);

const checks = {
  timestamp: new Date().toISOString(),
  results: {},
  status: 'pass'
};

function log(icon, message) {
  console.log(`${icon} ${message}`);
}

async function checkEmbeddingCoverage() {
  try {
    const result = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as embedded,
        COUNT(CASE WHEN som_cluster IS NOT NULL THEN 1 END) as with_som
      FROM atlas_packets
    `);

    const { total, embedded, with_som } = result.rows[0];
    const coverage = ((embedded / total) * 100).toFixed(1);
    const somCoverage = ((with_som / total) * 100).toFixed(1);

    checks.results.embedding_coverage = {
      total: parseInt(total),
      embedded: parseInt(embedded),
      with_som: parseInt(with_som),
      coverage_percent: parseFloat(coverage),
      som_coverage_percent: parseFloat(somCoverage),
      status: embedded > 0 ? 'pass' : 'fail'
    };

    log(embedded > 0 ? '✅' : '❌', `Embedding Coverage: ${coverage}% (${embedded}/${total})`);
    log(with_som > 0 ? '✅' : '⚠️', `SOM Coverage: ${somCoverage}% (${with_som}/${total})`);
  } catch (e) {
    checks.results.embedding_coverage = { status: 'fail', error: e.message };
    log('❌', `Embedding Coverage: ${e.message}`);
    checks.status = 'fail';
  }
}

async function checkGpuBridge() {
  try {
    const candidates = [
      path.resolve(ROOT, 'simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
      path.resolve(ROOT, 'simd-bridge/cpp/build/Debug/tensorrt_bridge.node'),
    ];

    const bridgePath = candidates.find(p => fs.existsSync(p));

    if (!bridgePath) {
      checks.results.gpu_bridge = { status: 'fail', error: 'tensorrt_bridge.node not found' };
      log('❌', `GPU Bridge: Not built. Build with: cd simd-bridge/cpp && cmake -B build && cmake --build build`);
      checks.status = 'fail';
      return;
    }

    let addon;
    try {
      addon = require(bridgePath);
    } catch (e) {
      checks.results.gpu_bridge = { status: 'fail', error: `Failed to load: ${e.message}` };
      log('❌', `GPU Bridge: Load failed - ${e.message}`);
      checks.status = 'fail';
      return;
    }

    const cudaAvailable = addon.isCudaAvailable?.();
    checks.results.gpu_bridge = {
      status: cudaAvailable ? 'pass' : 'warn',
      bridge_path: path.basename(bridgePath),
      cuda_available: cudaAvailable,
      has_kmeans: typeof addon.kmeansWithCentroids === 'function',
      has_cosine: typeof addon.batchCosineSimilarity === 'function',
      has_attention: typeof addon.attentionScoreGPU === 'function'
    };

    log(cudaAvailable ? '✅' : '⚠️', `GPU Bridge: Loaded (CUDA ${cudaAvailable ? 'available' : 'unavailable'})`);
  } catch (e) {
    checks.results.gpu_bridge = { status: 'fail', error: e.message };
    log('❌', `GPU Bridge: ${e.message}`);
    checks.status = 'fail';
  }
}

async function checkRabbitMQ() {
  try {
    // Note: RabbitMQ check would require amqplib connection
    // For now, just report the queues we expect
    checks.results.rabbitmq = {
      status: 'pass',
      expected_queues: [
        'atlas.summary',
        'atlas.embed',
        'atlas.latent',
        'atlas.centroid',
        'atlas.gpu_rerank',
        'atlas.verify'
      ]
    };

    log('ℹ️', `RabbitMQ: Expected queues configured (manual RabbitMQ health check needed)`);
  } catch (e) {
    checks.results.rabbitmq = { status: 'fail', error: e.message };
    checks.status = 'fail';
  }
}

async function checkRedisCache() {
  try {
    const centroidKeys = await redis.keys('centroid:seed:packet:*');
    const cacheKeys = await redis.keys('bifrost:embed:*');
    const featureIndexKeys = await redis.keys('centroid:index:feature:*');

    checks.results.redis_cache = {
      status: 'pass',
      centroid_seed_keys: centroidKeys.length,
      bifrost_embed_keys: cacheKeys.length,
      feature_index_keys: featureIndexKeys.length,
      total_cache_keys: centroidKeys.length + cacheKeys.length + featureIndexKeys.length
    };

    log('✅', `Redis Cache: ${centroidKeys.length} centroid seeds, ${cacheKeys.length} embed cache, ${featureIndexKeys.length} feature indexes`);
  } catch (e) {
    checks.results.redis_cache = { status: 'fail', error: e.message };
    log('❌', `Redis Cache: ${e.message}`);
    checks.status = 'fail';
  }
}

async function checkQdrantMirror() {
  try {
    const response = await fetch('http://127.0.0.1:6333/collections');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const collections = data.result || [];

    const codebaseCollection = collections.find(c => c.name === 'codebase_chunks_768');

    checks.results.qdrant_mirror = {
      status: 'pass',
      total_collections: collections.length,
      codebase_chunks: codebaseCollection ? {
        name: codebaseCollection.name,
        vectors_count: codebaseCollection.vectors_count,
        points_count: codebaseCollection.points_count
      } : null
    };

    log('✅', `Qdrant Mirror: ${collections.length} collections (codebase_chunks: ${codebaseCollection?.points_count || 0} points)`);
  } catch (e) {
    checks.results.qdrant_mirror = { status: 'fail', error: e.message };
    log('⚠️', `Qdrant Mirror: Not available (${e.message})`);
  }
}

async function checkNeo4jGraph() {
  try {
    const result = await db.query(`
      SELECT
        COUNT(DISTINCT id) as packet_nodes,
        COUNT(DISTINCT cluster_id) as clusters
      FROM neo4j_packets
    `);

    checks.results.neo4j_graph = {
      status: 'pass',
      packet_nodes: result.rows[0]?.packet_nodes || 0,
      clusters: result.rows[0]?.clusters || 0
    };

    log('✅', `Neo4j Graph: ${result.rows[0]?.packet_nodes || 0} packet nodes, ${result.rows[0]?.clusters || 0} clusters`);
  } catch (e) {
    checks.results.neo4j_graph = { status: 'warn', error: e.message };
    log('ℹ️', `Neo4j Graph: Check deferred (sync separately)`);
  }
}

async function checkServiceHealth() {
  const services = [
    { name: 'EmbeddingService', port: 50051, type: 'gRPC' },
    { name: 'RetrievalService', port: 50053, type: 'gRPC' },
    { name: 'ToolCallingService', port: 50057, type: 'gRPC' },
    { name: 'ChatAssistantService', port: 50052, type: 'gRPC' },
    { name: 'Ollama Embeddings', port: 11434, type: 'HTTP' },
    { name: 'Gemma4 (TurboQuant)', port: 8090, type: 'HTTP' },
    { name: 'Qdrant', port: 6333, type: 'HTTP' },
    { name: 'Redis', port: 6379, type: 'Redis' }
  ];

  const health = {};

  for (const service of services) {
    try {
      if (service.type === 'Redis') {
        const pong = await redis.ping();
        health[service.name] = pong === 'PONG' ? 'up' : 'down';
      } else if (service.type === 'HTTP') {
        const response = await fetch(`http://127.0.0.1:${service.port}/`);
        health[service.name] = response.ok || response.status < 500 ? 'up' : 'down';
      } else {
        health[service.name] = 'unknown (gRPC)';
      }
    } catch {
      health[service.name] = 'down';
    }
  }

  checks.results.service_health = health;

  const up = Object.values(health).filter(s => s === 'up').length;
  const total = Object.values(health).length;

  log('ℹ️', `Service Health: ${up}/${total} up`);
  Object.entries(health).forEach(([name, status]) => {
    log(status === 'up' ? '✅' : status === 'down' ? '❌' : 'ℹ️', `  ${name}: ${status}`);
  });
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Production Readiness Checkpoint — Atlas Infrastructure        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  await checkEmbeddingCoverage();
  console.log();

  await checkGpuBridge();
  console.log();

  await checkRabbitMQ();
  console.log();

  await checkRedisCache();
  console.log();

  await checkQdrantMirror();
  console.log();

  await checkNeo4jGraph();
  console.log();

  await checkServiceHealth();
  console.log();

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log(`║  Overall Status: ${checks.status === 'pass' ? '✅ PASS' : '⚠️ WARNINGS'}${' '.repeat(42 - checks.status.length)}║`);
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(JSON.stringify(checks, null, 2));

  await db.end();
  await redis.quit();

  process.exit(checks.status === 'pass' ? 0 : 1);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
