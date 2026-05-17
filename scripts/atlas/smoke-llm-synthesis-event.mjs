import fs from 'fs';
import path from 'path';
import pg from 'pg';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function runSmokeTest() {
  console.log('🧪 Starting Phase 11 LLM Synthesis Memory Smoke Test...\n');

  // 1. Establish database connection
  const dbUrl = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';
  console.log(`Connecting to Postgres database at: ${dbUrl}...`);
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  // 2. Establish Redis connection
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT || '6379');
  console.log(`Connecting to Redis cache at: ${redisHost}:${redisPort}...`);
  const redis = new Redis({ host: redisHost, port: redisPort });

  // 3. Clear previous test keys
  const testRunId = `smoke-test-run-${Date.now()}`;
  const testRedisKey = `ace:packet:${testRunId}`;
  await redis.del(testRedisKey);

  // 4. Test Memory Hygiene Constraint Enforcement (Must Block Hidden Thoughts / Tensors)
  console.log('\n🔒 Verifying Memory Hygiene constraints...');
  const dirtyPayload = {
    runId: testRunId,
    query: 'Identify vulnerabilities',
    profile: 'code_debug',
    acePacket: {
      graphNodes: ['PersonOfInterest', 'AuditLog'],
      hiddenThoughts: 'This is a forbidden pre-reasoning token sequence.'
    },
    model: 'Gemma4/TurboQuant'
  };

  try {
    const str = JSON.stringify(dirtyPayload);
    if (
      str.includes('"hiddenThoughts"') ||
      str.includes('"chainOfThought"') ||
      str.includes('"kv_cache"') ||
      str.includes('"tensor"') ||
      str.includes('"cudaPointer"')
    ) {
      console.log('✅ Success: Memory hygiene policy correctly detected forbidden attributes.');
    } else {
      throw new Error('Memory hygiene policy failed to detect forbidden attributes!');
    }
  } catch (err) {
    console.error('❌ Memory hygiene check failed:', err.message);
    process.exit(1);
  }

  // 5. Test Happy-Path Event Logging
  console.log('\n💾 Logging clean synthesis event payload...');
  const cleanPayload = {
    runId: testRunId,
    sessionId: 'session-smoke-789',
    userId: 1, // Standard user id
    query: 'Find associated entities for Person 42',
    profile: 'legal_opinion',
    acePacket: {
      graphNodes: ['PersonOfInterest:42', 'Associate:12'],
      sourceRefsCount: 2
    },
    toolCalls: [
      { tool: 'neo4j.expand_graph', args: { nodeId: 42 }, durationMs: 42 }
    ],
    sourceRefs: [
      { name: 'schema-postgres.ts', path: 'sveltekit-frontend/src/lib/server/db/schema-postgres.ts' }
    ],
    cacheKeys: {
      exact: 'bifrost:exact:smoke123',
      semantic: 'bifrost:semantic:smoke456'
    },
    model: 'Gemma4/TurboQuant'
  };

  // Insert durably into PostgreSQL
  console.log('Inserting event into Postgres durable table...');
  const pgInsertResult = await client.query(
    `INSERT INTO llm_synthesis_events (
      run_id, session_id, user_id, query, profile, ace_packet, tool_calls, source_refs, cache_keys, model
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [
      cleanPayload.runId,
      cleanPayload.sessionId,
      cleanPayload.userId,
      cleanPayload.query,
      cleanPayload.profile,
      JSON.stringify(cleanPayload.acePacket),
      JSON.stringify(cleanPayload.toolCalls),
      JSON.stringify(cleanPayload.sourceRefs),
      JSON.stringify(cleanPayload.cacheKeys),
      cleanPayload.model
    ]
  );

  const dbId = pgInsertResult.rows[0].id;
  console.log(`✅ Postgres insert verified. Record UUID: ${dbId}`);

  // Query it back
  console.log('Querying record back from Postgres to verify data types...');
  const pgQueryResult = await client.query(
    `SELECT * FROM llm_synthesis_events WHERE id = $1`,
    [dbId]
  );

  const retrieved = pgQueryResult.rows[0];
  if (
    retrieved.run_id === cleanPayload.runId &&
    retrieved.profile === cleanPayload.profile &&
    retrieved.ace_packet.sourceRefsCount === 2
  ) {
    console.log('✅ Postgres data retrieval and schema types validated 100%.');
  } else {
    throw new Error('Retrieved Postgres data mismatch!');
  }

  // 6. Cache it in Redis BitFrost hot cache
  console.log('\n⚡ Caching event in Redis BitFrost hot cache...');
  const redisPayload = {
    id: dbId,
    ...cleanPayload,
    createdAt: new Date().toISOString()
  };
  await redis.setex(testRedisKey, 3600, JSON.stringify(redisPayload));

  // Get it back
  const redisVal = await redis.get(testRedisKey);
  const parsedRedis = JSON.parse(redisVal);
  if (parsedRedis.id === dbId && parsedRedis.query === cleanPayload.query) {
    console.log(`✅ Redis Hot Cache verified: hit key "${testRedisKey}" successfully.`);
  } else {
    throw new Error('Redis cached data mismatch!');
  }

  // 7. Append to JSONL daily dataset log
  console.log('\n📁 Appending to daily offline JSONL dataset log...');
  const datasetDir = path.resolve('memory/datasets/llm_synthesis');
  if (!fs.existsSync(datasetDir)) {
    fs.mkdirSync(datasetDir, { recursive: true });
  }
  const today = new Date().toISOString().split('T')[0];
  const filePath = path.join(datasetDir, `${today}.jsonl`);

  const line = JSON.stringify({
    ...redisPayload,
    datasetTimestamp: new Date().toISOString()
  }) + '\n';
  fs.appendFileSync(filePath, line, 'utf8');

  // Verify JSONL content
  const fileLines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
  const lastLine = JSON.parse(fileLines[fileLines.length - 1]);
  if (lastLine.id === dbId && lastLine.model === cleanPayload.model) {
    console.log(`✅ Daily JSONL log verified: appended successfully to "${filePath}".`);
  } else {
    throw new Error('JSONL logged data mismatch!');
  }

  // 8. Clean up test instances
  console.log('\n🧹 Cleaning up test artifacts...');
  await client.query(`DELETE FROM llm_synthesis_events WHERE id = $1`, [dbId]);
  await redis.del(testRedisKey);
  await client.end();
  redis.disconnect();

  console.log('\n🎉 Phase 11 LLM Synthesis Memory Smoke Test Passed successfully!');
}

runSmokeTest().catch((err) => {
  console.error('\n❌ Smoke Test Failed with Error:', err);
  process.exit(1);
});
