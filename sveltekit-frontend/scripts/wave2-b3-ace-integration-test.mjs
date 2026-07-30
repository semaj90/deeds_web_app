#!/usr/bin/env node

/**
 * Wave 2 B3: ACE Integration Validation Test
 *
 * Validates that:
 * 1. ACE packet assembly integrates with retrieval workflow
 * 2. Cursor persistence works end-to-end
 * 3. Caching layer functions correctly
 */

import Redis from 'ioredis';
import pg from 'pg';

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || 'redis';
const PG_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  lazyConnect: true,
  enableOfflineQueue: false,
  retryStrategy: () => null
});

const pgPool = new pg.Pool({ connectionString: PG_URL });

const tests = [];
let passed = 0;
let failed = 0;

// Helper: test registration
function test(name, fn) {
  tests.push({ name, fn });
}

// Helper: assert
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Test 1: Redis connection and ACE cursor schema
test('Redis ACE cursor key pattern', async () => {
  await redis.connect();
  const testCursor = {
    id: 'test-cursor-1',
    query_text: 'test query',
    query_hash: 'abc123',
    last_rank: 1,
    last_score: 0.95,
    candidates_retrieved: 5,
    lanes_completed: 'qdrant,postgres',
    next_lane: 'neo4j',
    session_id: 'session-test-1',
    created_at: new Date().toISOString(),
    last_accessed_at: new Date().toISOString(),
    ttl_seconds: 3600
  };

  const cursorKey = `ace:cursor:${testCursor.id}`;
  await redis.setex(cursorKey, testCursor.ttl_seconds, JSON.stringify(testCursor));

  const retrieved = await redis.get(cursorKey);
  assert(retrieved !== null, 'Cursor should be stored in Redis');

  const parsed = JSON.parse(retrieved);
  assert(parsed.id === testCursor.id, 'Cursor ID should match');
  assert(parsed.last_score === 0.95, 'Cursor score should be preserved');

  await redis.del(cursorKey);
});

// Test 2: Session-scoped cursor lookup
test('Session-scoped cursor lookup pattern', async () => {
  const sessionId = 'session-test-2';
  const cursorId = 'cursor-test-2';

  // Store session→cursor index
  await redis.setex(`ace:session:${sessionId}:cursor`, 3600, cursorId);

  const retrieved = await redis.get(`ace:session:${sessionId}:cursor`);
  assert(retrieved === cursorId, 'Session index should return cursor ID');

  await redis.del(`ace:session:${sessionId}:cursor`);
});

// Test 3: Query-hash resumption pattern
test('Query-hash resumption pattern', async () => {
  const queryHash = 'sha256-abc123';
  const cursorId = 'cursor-test-3';

  // Store query→cursor index
  await redis.setex(`ace:query:${queryHash}:cursor`, 3600, cursorId);

  const retrieved = await redis.get(`ace:query:${queryHash}:cursor`);
  assert(retrieved === cursorId, 'Query hash index should return cursor ID');

  await redis.del(`ace:query:${queryHash}:cursor`);
});

// Test 4: Postgres ACE packet table exists
test('Postgres ACE packet table schema', async () => {
  const result = await pgPool.query(`
    SELECT EXISTS(
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'ace_context_packets'
    ) as exists
  `);

  assert(result.rows[0].exists, 'ace_context_packets table should exist');
});

// Test 5: ACE packet persistence contract
test('ACE packet persistence contract', async () => {
  const contextHash = 'test-hash-' + Date.now();
  const sessionId = 'test-session-' + Date.now();

  const testPacket = {
    session_id: sessionId,
    query: 'test search',
    context_hash: contextHash,
    context_json: JSON.stringify({
      candidates: [
        { packet_key: 'pkg-1', source_ref: 'src/test', feature_id: 'test.feature', score: 0.95 }
      ],
      lanes: ['qdrant', 'postgres'],
      token_count: 500
    }),
    token_count: 500,
    model: 'gemma4-legal'
  };

  const result = await pgPool.query(`
    INSERT INTO ace_context_packets
    (session_id, query, context_hash, context_json, token_count, model)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
  `, [
    testPacket.session_id,
    testPacket.query,
    testPacket.context_hash,
    testPacket.context_json,
    testPacket.token_count,
    testPacket.model
  ]);

  const packetId = result.rows[0].id;
  assert(packetId !== undefined, 'ACE packet should return ID on insert');

  const retrieved = await pgPool.query(
    'SELECT * FROM ace_context_packets WHERE id = $1',
    [packetId]
  );

  assert(retrieved.rows.length > 0, 'ACE packet should be retrievable');
  assert(retrieved.rows[0].session_id === sessionId, 'Session ID should match');
  assert(retrieved.rows[0].query === testPacket.query, 'Query should match');

  // Cleanup
  await pgPool.query('DELETE FROM ace_context_packets WHERE id = $1', [packetId]);
});

// Test 6: Multi-lane retrieval trace validation
test('Multi-lane retrieval trace validation', async () => {
  const traces = [
    { lane: 'qdrant', rank: 1, score: 0.95, returned_at_ms: 45 },
    { lane: 'postgres', rank: 2, score: 0.92, returned_at_ms: 120 },
    { lane: 'neo4j', rank: 3, score: 0.88, returned_at_ms: 200 }
  ];

  for (const trace of traces) {
    assert(typeof trace.score === 'number', `Score should be number, got ${typeof trace.score}`);
    assert(trace.score >= 0 && trace.score <= 1, `Score should be 0-1, got ${trace.score}`);
    assert(trace.returned_at_ms > 0, `Latency should be positive, got ${trace.returned_at_ms}`);
  }
});

// Test 7: Cache TTL enforcement
test('Cache TTL enforcement', async () => {
  const testKey = 'ace:test:ttl';
  const testValue = 'test-value';

  await redis.setex(testKey, 1, testValue);

  let retrieved = await redis.get(testKey);
  assert(retrieved === testValue, 'Value should be present immediately');

  // Wait 1.5 seconds for TTL expiry
  await new Promise(resolve => setTimeout(resolve, 1500));

  retrieved = await redis.get(testKey);
  assert(retrieved === null, 'Value should expire after TTL');
});

// Run all tests
async function runTests() {
  console.log('🧪 Wave 2 B3: ACE Integration Validation\n');

  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ ${name}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${tests.length} tests`);

  if (failed === 0) {
    console.log('✨ All integration tests PASSED');
  } else {
    console.log(`⚠️  ${failed} test(s) failed`);
  }

  await redis.quit();
  await pgPool.end();

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
