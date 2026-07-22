#!/usr/bin/env node
/**
 * Smoke Test: Redis Cache (BitFrost) Contract Validation
 *
 * Validates that Redis/Valkey is running and BitFrost cache layers work:
 * 1. Redis connection establishes
 * 2. PING succeeds
 * 3. SET/GET cycle works (L1 exact-match cache)
 * 4. DEL works (cache invalidation)
 * 5. HSET/HGET works (Redis cache multi-field)
 * 6. TTL/EXPIRE works (cache eviction)
 * 7. Memory stats are readable
 */

import Redis from 'ioredis';
import { performance } from 'perf_hooks';

interface TestResult {
  gate: number;
  name: string;
  passed: boolean;
  duration_ms?: number;
  error?: string;
}

const results: TestResult[] = [];

// ============================================================================
// Redis Client Setup
// ============================================================================

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || 'redis'; // Valkey default: redis

const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: () => null,
});

// ============================================================================
// Test Harness
// ============================================================================

async function test(gateNum: number, name: string, fn: () => Promise<void>) {
  const start = performance.now();
  try {
    await fn();
    const duration = performance.now() - start;
    results.push({ gate: gateNum, name, passed: true, duration_ms: duration });
    console.log(`✅ Gate ${gateNum}: ${name} (${duration.toFixed(1)}ms)`);
  } catch (err) {
    const duration = performance.now() - start;
    const error = err instanceof Error ? err.message : String(err);
    results.push({ gate: gateNum, name, passed: false, duration_ms: duration, error });
    console.log(`❌ Gate ${gateNum}: ${name} (${duration.toFixed(1)}ms)`);
    console.log(`   Error: ${error}`);
  }
}

// ============================================================================
// Main Smoke Test
// ============================================================================

async function main() {
  console.log(`Connecting to Redis at ${REDIS_HOST}:${REDIS_PORT}...`);
  console.log('');

  // ========================================================================
  // Gate 1: Connection Establishes
  // ========================================================================

  await test(1, 'Redis connection establishes', async () => {
    try {
      await redis.connect();
    } catch (err) {
      throw new Error(`Connection failed: ${err}`);
    }
  });

  // ========================================================================
  // Gate 2: PING Succeeds
  // ========================================================================

  await test(2, 'PING succeeds', async () => {
    const pong = await redis.ping();
    if (pong !== 'PONG') {
      throw new Error(`Expected PONG, got ${pong}`);
    }
  });

  // ========================================================================
  // Gate 3: SET/GET L1 Cache (Exact-Match)
  // ========================================================================

  await test(3, 'SET/GET cycle works (L1 exact-match)', async () => {
    const testKey = 'bitfrost:test:exact-match';
    const testValue = JSON.stringify({ query: 'test', score: 0.95 });

    await redis.set(testKey, testValue);
    const retrieved = await redis.get(testKey);

    if (retrieved !== testValue) {
      throw new Error(`Value mismatch: set "${testValue}", got "${retrieved}"`);
    }
  });

  // ========================================================================
  // Gate 4: DEL Works (Cache Invalidation)
  // ========================================================================

  await test(4, 'DEL works (cache invalidation)', async () => {
    const testKey = 'bitfrost:test:invalidate';
    await redis.set(testKey, 'value');

    const deleted = await redis.del(testKey);
    if (deleted !== 1) {
      throw new Error(`Expected 1 key deleted, got ${deleted}`);
    }

    const retrieved = await redis.get(testKey);
    if (retrieved !== null) {
      throw new Error(`Key should be deleted, but still exists: ${retrieved}`);
    }
  });

  // ========================================================================
  // Gate 5: HSET/HGET Works (Multi-Field Cache)
  // ========================================================================

  await test(5, 'HSET/HGET works (multi-field cache)', async () => {
    const testHash = 'bitfrost:test:hash';
    const testFields = {
      query: 'test query',
      score: '0.95',
      timestamp: new Date().toISOString(),
    };

    await redis.hset(testHash, testFields);

    const query = await redis.hget(testHash, 'query');
    const score = await redis.hget(testHash, 'score');

    if (query !== testFields.query) {
      throw new Error(`Query field mismatch: expected "${testFields.query}", got "${query}"`);
    }

    if (score !== testFields.score) {
      throw new Error(`Score field mismatch: expected "${testFields.score}", got "${score}"`);
    }

    await redis.del(testHash);
  });

  // ========================================================================
  // Gate 6: TTL/EXPIRE Works (Cache Eviction)
  // ========================================================================

  await test(6, 'TTL/EXPIRE works (cache eviction)', async () => {
    const testKey = 'bitfrost:test:ttl';
    const testValue = 'temporary';

    await redis.set(testKey, testValue);
    await redis.expire(testKey, 2);

    const ttl = await redis.ttl(testKey);
    if (ttl < 0 || ttl > 2) {
      throw new Error(`TTL should be 1-2 seconds, got ${ttl}`);
    }

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 2100));

    const retrieved = await redis.get(testKey);
    if (retrieved !== null) {
      throw new Error(`Key should have expired, but still exists: ${retrieved}`);
    }
  });

  // ========================================================================
  // Gate 7: Memory Stats Readable
  // ========================================================================

  await test(7, 'Memory stats are readable', async () => {
    const info = await redis.info('memory');
    if (!info || typeof info !== 'string') {
      throw new Error('INFO memory command failed or returned non-string');
    }

    if (!info.includes('used_memory')) {
      throw new Error('Memory info does not contain "used_memory" field');
    }
  });

  // ========================================================================
  // Summary
  // ========================================================================

  await redis.quit();

  console.log('\n' + '='.repeat(70));
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const totalTime = results.reduce((sum, r) => sum + (r.duration_ms || 0), 0);

  if (passed === total) {
    console.log(`✅ ALL GATES PASSED (${passed}/${total}, ${totalTime.toFixed(1)}ms total)`);
    console.log('='.repeat(70));
    process.exit(0);
  } else {
    console.log(`❌ GATES FAILED (${passed}/${total} passed, ${totalTime.toFixed(1)}ms total)`);
    console.log('='.repeat(70));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
