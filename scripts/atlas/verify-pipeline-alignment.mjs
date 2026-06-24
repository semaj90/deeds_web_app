#!/usr/bin/env node
/**
 * scripts/atlas/verify-pipeline-alignment.mjs
 *
 * Verification script: checks all 7 services in the parallel retrieval + summary pipeline.
 *
 * Services checked:
 * 1. llama-server (:8090) — Gemma4 Stage 1
 * 2. Qdrant (:6333) — Retrieval Lane 1 + Stage 2 tag storage
 * 3. Redis (:6379) — Retrieval Lane 3 + Stage 3 centroids
 * 4. PostgreSQL (:5434) — Canonical truth + Stage 2/3/4
 * 5. Neo4j (:7687) — Retrieval Lane 5 (topology)
 * 6. TurboVec (:50055) — Retrieval Lane 2 (sparse search)
 * 7. Bifrost (:3040) — L1/L2 semantic cache
 *
 * Exit code: 0 if all critical services OK, 1 if any critical service fails
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fetch from 'node-fetch';
import pg from 'pg';
import Redis from 'ioredis';
import { QdrantClient } from '@qdrant/js-client-rest';

const __dir = path.dirname(fileURLToPath(import.meta.url));

const VERBOSE = process.argv.includes('--verbose');
const TIMEOUT = 5000; // milliseconds

function log(...args) { console.log(...args); }
function vlog(...args) { if (VERBOSE) console.log(...args); }
function err(...args) { console.error(...args); }

// Config

const LLAMA_URL = process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8090';
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASS = process.env.REDIS_PASSWORD || process.env.REDIS_PASS || 'redis';
const PG_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const NEO4J_URL = process.env.NEO4J_URL || 'http://127.0.0.1:7474';
const TURBOVEC_URL = process.env.TURBOVEC_URL || 'http://127.0.0.1:50055';
const BIFROST_URL = process.env.BIFROST_URL || 'http://127.0.0.1:3040';

// Service checks

const services = {
  llama_server: { critical: true, status: false, message: '' },
  qdrant: { critical: true, status: false, message: '' },
  redis: { critical: true, status: false, message: '' },
  postgres: { critical: true, status: false, message: '' },
  neo4j: { critical: false, status: false, message: '' },
  turbovec: { critical: false, status: false, message: '' },
  bifrost: { critical: false, status: false, message: '' },
};

// Check llama-server

async function checkLlamaServer() {
  try {
    const res = await fetch(`${LLAMA_URL}/v1/models`, { signal: AbortSignal.timeout(TIMEOUT) });
    if (res.ok) {
      const data = await res.json();
      services.llama_server.status = true;
      services.llama_server.message = `✅ Gemma4 ready (${data.data?.length || 1} model(s))`;
      return true;
    }
  } catch (e) {
    services.llama_server.message = `❌ ${e.message}`;
  }
  return false;
}

// Check Qdrant

async function checkQdrant() {
  try {
    const qdrant = new QdrantClient({ url: QDRANT_URL });
    const collections = await qdrant.getCollections();
    if (collections.collections.length > 0) {
      services.qdrant.status = true;
      services.qdrant.message = `✅ ${collections.collections.length} collections online`;
      return true;
    }
  } catch (e) {
    services.qdrant.message = `❌ ${e.message}`;
  }
  return false;
}

// Check Redis

async function checkRedis() {
  const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PASS, connectTimeout: TIMEOUT });
  try {
    const pong = await redis.ping();
    const info = await redis.info('memory');
    const memoryUsed = info.match(/used_memory_human:(.+?)\r/)?.[1] || 'unknown';
    services.redis.status = true;
    services.redis.message = `✅ PONG (${memoryUsed} memory used)`;
    await redis.quit();
    return true;
  } catch (e) {
    services.redis.message = `❌ ${e.message}`;
  }
  return false;
}

// Check PostgreSQL

async function checkPostgres() {
  const pool = new pg.Pool({ connectionString: PG_URL, connectionTimeoutMillis: TIMEOUT });
  try {
    const res = await pool.query('SELECT COUNT(*) as chunk_count FROM codebase_chunk_index');
    const count = res.rows[0].chunk_count;
    services.postgres.status = true;
    services.postgres.message = `✅ ${count} chunks in codebase_chunk_index`;
    await pool.end();
    return true;
  } catch (e) {
    services.postgres.message = `❌ ${e.message}`;
  }
  return false;
}

// Check Neo4j

async function checkNeo4j() {
  try {
    const res = await fetch(`${NEO4J_URL}/db/neo4j/`, {
      headers: { 'Authorization': 'Basic bmVvNGo6cGFzc3dvcmQ=' },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (res.status === 200 || res.status === 401) {
      services.neo4j.status = true;
      services.neo4j.message = `✅ Neo4j available`;
      return true;
    }
  } catch (e) {
    services.neo4j.message = `❌ ${e.message}`;
  }
  return false;
}

// Check TurboVec

async function checkTurboVec() {
  try {
    const res = await fetch(`${TURBOVEC_URL}/health`, { signal: AbortSignal.timeout(TIMEOUT) });
    if (res.ok) {
      services.turbovec.status = true;
      services.turbovec.message = `✅ TurboVec (gRPC sparse) available`;
      return true;
    }
  } catch (e) {
    services.turbovec.message = `❌ ${e.message}`;
  }
  return false;
}

// Check Bifrost

async function checkBifrost() {
  try {
    const res = await fetch(`${BIFROST_URL}/health`, { signal: AbortSignal.timeout(TIMEOUT) });
    if (res.ok) {
      services.bifrost.status = true;
      services.bifrost.message = `✅ Bifrost (L1/L2 cache) available`;
      return true;
    }
  } catch (e) {
    services.bifrost.message = `❌ ${e.message}`;
  }
  return false;
}

// Run all checks in parallel

async function runChecks() {
  log('\n🔍 Pipeline Alignment Verification\n');
  log('Checking all 7 services...\n');

  await Promise.all([
    checkLlamaServer(),
    checkQdrant(),
    checkRedis(),
    checkPostgres(),
    checkNeo4j(),
    checkTurboVec(),
    checkBifrost(),
  ]);

  log('═══ Service Status ═══\n');

  let criticalFailed = false;

  for (const [name, info] of Object.entries(services)) {
    const label = name.replace(/_/g, ' ').toUpperCase();
    const status = info.status ? '✅' : '❌';
    const critical = info.critical ? ' [CRITICAL]' : ' [optional]';

    log(`${status} ${label}${critical}`);
    log(`   ${info.message}\n`);

    if (info.critical && !info.status) {
      criticalFailed = true;
    }
  }

  // Summary

  const allPassing = Object.values(services).every((s) => s.status);
  const criticalPassing = Object.values(services)
    .filter((s) => s.critical)
    .every((s) => s.status);

  log('═══ Summary ═══\n');

  if (allPassing) {
    log('✅ All services online');
  } else if (criticalPassing) {
    log('⚠️  Critical services online, some optional services offline');
  } else {
    log('❌ Some CRITICAL services offline');
  }

  log('\n📋 Pipeline Alignment Checklist:\n');
  log('Phase 1 (Parallel GPU Requests):');
  log(`  ${services.llama_server.status ? '✅' : '❌'} Gemma4 (:8090) for Stage 1 summary backfill\n`);

  log('Phase 2 (Feature Extraction):');
  log(`  ${services.postgres.status ? '✅' : '❌'} PostgreSQL for Stage 2 embed query\n`);

  log('Phase 3 (Parallel Retrieval Orchestrator):');
  log(`  ${services.qdrant.status ? '✅' : '❌'} Qdrant (:6333) Lane 1 — dense semantic\n`);
  log(`  ${services.turbovec.status ? '✅' : '❌'} TurboVec (:50055) Lane 2 — sparse search\n`);
  log(`  ${services.redis.status ? '✅' : '❌'} Redis (:6379) Lane 3 — centroids cache\n`);
  log(`  ${services.postgres.status ? '✅' : '❌'} PostgreSQL Lane 4 — FTS\n`);
  log(`  ${services.neo4j.status ? '✅' : '❌'} Neo4j (:7474) Lane 5 — topology\n`);

  log('Phase 4 (LLM Synthesis + Caching):');
  log(`  ${services.bifrost.status ? '✅' : '❌'} Bifrost (:3040) L1/L2 cache\n`);
  log(`  ${services.llama_server.status ? '✅' : '❌'} Gemma4 (:8090) for Stage 5 synthesis\n`);

  log('═══ Recommendations ═══\n');

  if (!services.llama_server.status) {
    log('⚠️  Launch llama-server:');
    log('    Launch TurboQuant via: npm run turbo:start\n');
  }

  if (!services.qdrant.status) {
    log('⚠️  Start Qdrant:');
    log('    docker-compose up -d legal-ai-qdrant\n');
  }

  if (!services.redis.status) {
    log('⚠️  Start Redis/Valkey:');
    log('    docker-compose up -d legal-ai-redis\n');
  }

  if (!services.postgres.status) {
    log('⚠️  Start PostgreSQL:');
    log('    docker-compose up -d legal-ai-postgres\n');
  }

  if (!services.neo4j.status) {
    log('⚠️  Start Neo4j (optional for topology lane):');
    log('    docker-compose up -d legal-ai-neo4j\n');
  }

  log('\n🚀 Ready to run:\n');
  log('  # 1. Dry-run test\n');
  log('  node scripts/atlas/summary-ranking-retrieval-pipeline.mjs --stage=1 --limit=20 --batch=20 --dry-run --verbose\n');
  log('  # 2. Apply summaries\n');
  log('  node scripts/atlas/summary-ranking-retrieval-pipeline.mjs --stage=1 --limit=2000 --batch=250 --apply\n');
  log('  # 3. Embed summaries\n');
  log('  node scripts/atlas/summary-ranking-retrieval-pipeline.mjs --stage=2 --limit=5000 --batch=500 --apply\n');
  log('  # 4. Compute centroids\n');
  log('  node scripts/atlas/summary-ranking-retrieval-pipeline.mjs --stage=3 --apply\n');
  log('  # 5. Warm ACE cache\n');
  log('  node scripts/atlas/summary-ranking-retrieval-pipeline.mjs --stage=4 --apply\n');

  process.exit(criticalFailed ? 1 : 0);
}

runChecks().catch((e) => {
  err(`Fatal error: ${e.message}`);
  process.exit(2);
});
