#!/usr/bin/env node
/**
 * semantic-phase-stack-smoke.mjs
 *
 * Validates the semantic cache stack end-to-end:
 * - Phase 1: pgvector semantic cache test script (miss -> save -> hit)
 * - Phase 2: Redis semantic index is reachable
 * - Phase 3: Karpathy 64d publish key exists after test run
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import Redis from 'ioredis';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const ROOT = path.resolve(process.cwd());
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const DATABASE_URL = process.env.DATABASE_URL;

const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function fail(msg) {
  console.error(`${c.red('FAIL')} ${msg}`);
  process.exit(1);
}

function runPhase1Test() {
  const result = spawnSync('npx', ['tsx', 'scripts/test-semantic-cache.ts'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if ((result.status ?? 1) !== 0) {
    fail('Phase 1 semantic cache test failed.');
  }
}

async function checkDatabaseTable() {
  if (!DATABASE_URL) {
    fail('DATABASE_URL is not set.');
  }

  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const reg = await client.query("select to_regclass('public.semantic_cache') as tbl");
    if (!reg.rows[0]?.tbl) {
      fail('semantic_cache table is missing.');
    }
  } finally {
    await client.end();
  }
}

async function checkRedisAndKarpathyPublish() {
  const redis = new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });

  try {
    await redis.connect();
    await redis.ping();

    let semanticIndexAvailable = false;
    try {
      await redis.call('FT.INFO', 'bifrost:semantic:idx');
      semanticIndexAvailable = true;
    } catch {
      semanticIndexAvailable = false;
    }

    if (!semanticIndexAvailable) {
      fail('Phase 2 Redis semantic index bifrost:semantic:idx is unavailable.');
    }

    const karpathyKeys = await redis.keys('gpu:karpathy:encoded:*');
    if (karpathyKeys.length === 0) {
      fail('Phase 3 Karpathy publish key gpu:karpathy:encoded:* was not written.');
    }

    console.log(`  ${c.green('✓')} Phase 2 Redis semantic index is available`);
    console.log(`  ${c.green('✓')} Phase 3 Karpathy publish keys found: ${karpathyKeys.length}`);
  } finally {
    redis.disconnect();
  }
}

async function main() {
  console.log(`\n${c.bold('Semantic Stack Smoke')} (Phase1 + Phase2 + Phase3)\n`);

  await checkDatabaseTable();
  console.log(`  ${c.green('✓')} semantic_cache table exists`);

  runPhase1Test();
  console.log(`  ${c.green('✓')} Phase 1 semantic cache test passed`);

  await checkRedisAndKarpathyPublish();

  console.log(`\n${c.green('PASS')} semantic stack smoke passed`);
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
