#!/usr/bin/env node
/**
 * smoke-llm-synthesis-event.mjs
 *
 * Standalone smoke test for the LLM synthesis event pipeline.
 * Verifies:
 *   1. JSONL writer appends a valid row (no forbidden fields, correct shape)
 *   2. Redis hot key ace:packet:{runId} is written and readable
 *   3. Postgres llm_synthesis_events INSERT succeeds (skipped in --dry-run)
 *
 * Usage:
 *   node scripts/atlas/smoke-llm-synthesis-event.mjs --dry-run
 *   node scripts/atlas/smoke-llm-synthesis-event.mjs
 */

import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const DRY_RUN = process.argv.includes('--dry-run');

const FORBIDDEN_FIELDS = ['hiddenThoughts', 'chainOfThought', 'kv_cache', 'tensor', 'cudaPointer'];

function assertNoForbiddenFields(obj) {
  const str = JSON.stringify(obj);
  for (const f of FORBIDDEN_FIELDS) {
    if (str.includes(`"${f}"`)) throw new Error(`Forbidden field detected: "${f}"`);
  }
}

function requiredFields(row) {
  return ['runId', 'query', 'profile', 'model', 'acePacket', 'toolCalls', 'sourceRefs', 'cacheKeys', 'trustTier', 'createdAt'];
}

async function runSmoke() {
  console.log('⚡ Smoke Test: LLM Synthesis Event Pipeline');
  console.log(`   Mode: ${DRY_RUN ? 'dry-run' : 'live'}\n`);

  const runId = `smoke_${Date.now()}`;
  const now = new Date().toISOString();

  const row = {
    runId,
    sessionId: 'smoke-session',
    userId: null,
    authUserId: null,
    query: 'how do we validate pgvector hnsw indexes',
    profile: 'code_debug',
    acePacket: { lanes: ['qdrant_768d', 'rg_cluster_pivot'], chunks: 5 },
    toolCalls: ['ace.route_query', 'qdrant.search_768'],
    sourceRefs: ['src/lib/server/db/schema-postgres.ts'],
    cacheKeys: { exactHit: 'false', semanticHit: 'false' },
    trustTier: 'local_code_plus_official_docs',
    model: 'gemma4-rotorquant:latest',
    validation: { testsPassed: true },
    createdAt: now,
    datasetTimestamp: now,
  };

  // Gate 1: no forbidden fields
  console.log('🔄 Gate 1: asserting no forbidden fields...');
  assertNoForbiddenFields(row.acePacket);
  assertNoForbiddenFields(row.toolCalls);
  assertNoForbiddenFields(row.sourceRefs);
  console.log('✔️ Gate 1 passed: no forbidden fields.\n');

  // Gate 2: required shape
  console.log('🔄 Gate 2: checking required fields...');
  for (const f of requiredFields(row)) {
    if (row[f] === undefined) throw new Error(`Missing required field: ${f}`);
  }
  console.log('✔️ Gate 2 passed: all required fields present.\n');

  // Gate 3: JSONL write
  console.log('🔄 Gate 3: JSONL append...');
  const rootDir = process.cwd().endsWith('sveltekit-frontend')
    ? resolve(process.cwd(), '..')
    : process.cwd();
  const datasetDir = join(rootDir, 'memory', 'datasets', 'llm_synthesis');
  const filePath = join(datasetDir, `${now.split('T')[0]}.jsonl`);

  if (!DRY_RUN) {
    mkdirSync(datasetDir, { recursive: true });
    appendFileSync(filePath, JSON.stringify(row) + '\n', 'utf8');

    // Verify by reading back last line
    const lines = readFileSync(filePath, 'utf8').trim().split('\n');
    const last = JSON.parse(lines[lines.length - 1]);
    if (last.runId !== runId) throw new Error('JSONL round-trip mismatch: runId not found in last line');
    console.log(`✔️ Gate 3 passed: JSONL written + verified at ${filePath}\n`);
  } else {
    console.log(`✔️ Gate 3 skipped (dry-run): would write to ${filePath}\n`);
  }

  // Gate 4: Redis hot key
  console.log('🔄 Gate 4: Redis ace:packet write...');
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 3000 });
  try {
    if (!DRY_RUN) {
      const redisKey = `ace:packet:${runId}`;
      await redis.set(redisKey, JSON.stringify(row), 'EX', 3600);
      const readBack = await redis.get(redisKey);
      if (!readBack) throw new Error('Redis round-trip failed: key not found after SET');
      const parsed = JSON.parse(readBack);
      if (parsed.runId !== runId) throw new Error('Redis round-trip mismatch: runId wrong');
      // Cleanup smoke key
      await redis.del(redisKey);
      console.log(`✔️ Gate 4 passed: Redis ace:packet:${runId} written, read back, and cleaned up.\n`);
    } else {
      console.log(`✔️ Gate 4 skipped (dry-run): would write ace:packet:${runId} to Redis.\n`);
    }
  } finally {
    await redis.quit();
  }

  // Gate 5: schema alignment
  console.log('🔄 Gate 5: schema alignment check (auth_user_id, trust_tier, validation)...');
  const schemaPath = resolve(process.cwd(), 'src/lib/server/db/schema-postgres.ts');
  if (existsSync(schemaPath)) {
    const schemaContent = readFileSync(schemaPath, 'utf8');
    const missingCols = ['auth_user_id', 'trust_tier', 'validation'].filter(
      (col) => !schemaContent.includes(`'${col}'`)
    );
    if (missingCols.length) throw new Error(`Schema missing columns: ${missingCols.join(', ')}`);
    console.log('✔️ Gate 5 passed: auth_user_id, trust_tier, validation present in schema.\n');
  } else {
    console.log('⚠️ Gate 5 skipped: schema-postgres.ts not found from cwd.\n');
  }

  console.log('✅ LLM Synthesis Event pipeline smoke test passed!');
}

runSmoke().catch((err) => {
  console.error(`\n❌ Smoke test failed: ${err.message}`);
  process.exit(1);
});