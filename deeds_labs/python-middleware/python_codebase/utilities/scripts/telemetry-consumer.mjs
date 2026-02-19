#!/usr/bin/env node
/*
  telemetry-consumer.mjs
  - Single consolidated ESM script to BRPOP from Redis `telemetry:events` and write Metric nodes to Neo4j.
  - Exports startConsumer/stopConsumer and auto-starts when executed directly.
*/
import Redis from 'redis';
import neo4j from 'neo4j-driver';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const NEO4J_URL = process.env.NEO4J_URL || process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

let redisClient = null;
let neoDriver = null;
let consumerRunning = false;
let consumerAbort = false;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function ensureRedis() {
  if (redisClient) return redisClient;
  redisClient = Redis.createClient({ url: REDIS_URL });
  redisClient.on('error', (e) => console.error('[redis] error', e?.message || e));
  await redisClient.connect();
  console.log('[redis] connected', REDIS_URL);
  return redisClient;
}

function ensureNeo4j() {
  if (neoDriver) return neoDriver;
  neoDriver = neo4j.driver(NEO4J_URL, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD), { disableLosslessIntegers: false });
  console.log('[neo4j] driver created', NEO4J_URL);
  return neoDriver;
}

async function processMessage(session, raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch (err) {
    console.warn('[consumer] invalid JSON payload, skipping', raw);
    return;
  }

  const ts = msg.ts ?? Date.now();
  const graphId = msg.graphId ?? 'unknown';
  const deviceId = msg.deviceId ?? msg.device?.id ?? 'unknown-device';
  const fps = msg.fps ?? msg.stats?.fps ?? null;
  const frameTime = msg.frameTime ?? msg.stats?.frameTime ?? null;
  const gpuMem = msg.gpuMemoryUsage ?? msg.stats?.gpuMemoryUsage ?? null;
  const nodeCount = msg.nodeCount ?? msg.stats?.nodeCount ?? null;
  const edgeCount = msg.edgeCount ?? msg.stats?.edgeCount ?? null;

  const cypher = `
    MERGE (d:Device {id:$deviceId})
    MERGE (g:Graph {id:$graphId})
    CREATE (m:Metric {ts:$ts})
    SET m.fps = $fps, m.frameTime = $frameTime, m.gpuMem = $gpuMem, m.nodeCount = $nodeCount, m.edgeCount = $edgeCount
    MERGE (d)-[:REPORTED]->(m)
    MERGE (g)-[:HAS_METRIC]->(m)
    RETURN m
  `;

  try {
    await session.writeTransaction(tx => tx.run(cypher, {
      deviceId, graphId, ts: neo4j.int(ts), fps, frameTime, gpuMem, nodeCount, edgeCount
    }));
  } catch (err) {
    console.error('[neo4j] write error', err?.message || err);
  }
}

export async function startConsumer() {
  if (consumerRunning) return;
  consumerRunning = true;
  consumerAbort = false;

  let reconnectDelay = 1000;
  while (!consumerAbort) {
    try {
      await ensureRedis();
      ensureNeo4j();
      const session = neoDriver.session();

      console.log('[consumer] started - BRPOP telemetry:events');
      while (!consumerAbort) {
        // 5 second timeout to allow checking consumerAbort
        const res = await redisClient.brPop('telemetry:events', 5);
        if (!res) continue; // timeout

        const raw = res.element ?? res.value ?? res[1] ?? null;
        if (!raw) continue;
        await processMessage(session, raw);
      }

      await session.close();
      reconnectDelay = 1000;
    } catch (err) {
      console.error('[consumer] loop error', err?.message || err);
      // cleanup and backoff
      try { if (redisClient) await redisClient.disconnect(); } catch (e) { /* ignore */ }
      try { if (neoDriver) await neoDriver.close(); } catch (e) { /* ignore */ }
      redisClient = null; neoDriver = null;
      if (consumerAbort) break;
      console.log(`[consumer] reconnecting in ${reconnectDelay}ms`);
      await sleep(reconnectDelay);
      reconnectDelay = Math.min(30000, reconnectDelay * 2);
    }
  }

  // final cleanup
  try { if (redisClient) await redisClient.disconnect(); } catch (e) { /* ignore */ }
  try { if (neoDriver) await neoDriver.close(); } catch (e) { /* ignore */ }
  consumerRunning = false;
  console.log('[consumer] stopped');
}

export async function stopConsumer() {
  consumerAbort = true;
  // give loop a moment to exit
  for (let i = 0; i < 10 && consumerRunning; i++) await sleep(200);
}

function setupSignalHandlers() {
  const shutdown = async () => {
    console.log('[consumer] shutdown requested');
    await stopConsumer();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Auto-start when executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('telemetry-consumer.mjs')) {
  setupSignalHandlers();
  startConsumer().catch(err => {
    console.error('[consumer] fatal', err?.message || err);
    process.exit(1);
  });
}
import Redis from 'redis';
import neo4j from 'neo4j-driver';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const NEO4J_URL = process.env.NEO4J_URL || process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

let _redisClient = null;
let _neoDriver = null;
let _running = false;

export async function startConsumer() {
  if (_running) return;
  _redisClient = Redis.createClient({ url: REDIS_URL });
  _redisClient.on('error', (e) => console.error('redis error', e));
  await _redisClient.connect();
  console.log('Connected to Redis', REDIS_URL);

  _neoDriver = neo4j.driver(NEO4J_URL, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const session = _neoDriver.session();

  _running = true;
  console.log('Telemetry consumer started - BRPOP telemetry:events');

  try {
    while (_running) {
      const res = await _redisClient.brPop('telemetry:events', 5);
      if (!res) continue; // timeout
      const raw = res.element ?? res.value ?? res[1];
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch (err) {
        console.warn('invalid telemetry payload', raw);
        continue;
      }

      const ts = msg.ts ?? Date.now();
      const graphId = msg.graphId ?? 'unknown';
      const deviceId = msg.deviceId ?? msg.device?.id ?? 'unknown-device';
      const fps = msg.fps ?? msg.stats?.fps ?? null;
      const frameTime = msg.frameTime ?? msg.stats?.frameTime ?? null;
      const gpuMem = msg.gpuMemoryUsage ?? msg.stats?.gpuMemoryUsage ?? null;
      const nodeCount = msg.nodeCount ?? msg.stats?.nodeCount ?? null;
      const edgeCount = msg.edgeCount ?? msg.stats?.edgeCount ?? null;

      const cypher = `
        MERGE (d:Device {id:$deviceId})
        MERGE (g:Graph {id:$graphId})
        CREATE (m:Metric {ts:$ts})
        SET m.fps = $fps, m.frameTime = $frameTime, m.gpuMem = $gpuMem, m.nodeCount = $nodeCount, m.edgeCount = $edgeCount
        MERGE (d)-[:REPORTED]->(m)
        MERGE (g)-[:HAS_METRIC]->(m)
        RETURN m`;

      try {
        await session.writeTransaction(tx => tx.run(cypher, { deviceId, graphId, ts: neo4j.int(ts), fps, frameTime, gpuMem, nodeCount, edgeCount }));
      } catch (err) {
        console.error('neo4j write error', err);
      }
    }
  } finally {
    await session.close();
    await _neoDriver.close();
    await _redisClient.disconnect();
    _running = false;
    console.log('Telemetry consumer stopped');
  }
}

export async function stopConsumer() {
  _running = false;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('telemetry-consumer.mjs')) {
  startConsumer().catch(e => {
    console.error('consumer fatal', e);
    process.exit(1);
  });
}
#!/usr/bin/env node
/*
  Telemetry consumer: BRPOP from Redis list `telemetry:events` and write metrics to Neo4j.
  Usage: REDIS_URL=redis://localhost:6379 NEO4J_URL=bolt://localhost:7687 NEO4J_USER=neo4j NEO4J_PASSWORD=pass node telemetry-consumer.mjs
*/
import Redis from 'redis';
import neo4j from 'neo4j-driver';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const NEO4J_URL = process.env.NEO4J_URL || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

const redisClient = Redis.createClient({ url: REDIS_URL });
redisClient.on('error', (err) => console.error('Redis client error', err));

const driver = neo4j.driver(NEO4J_URL, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));

async function start() {
  await redisClient.connect();
  console.log('Connected to Redis', REDIS_URL);

  const session = driver.session();

  console.log('Telemetry consumer started, blocking on telemetry:events');
  try {
    while (true) {
      // BRPOP returns [key, value] or null; timeout 5s to allow graceful shutdown
      const res = await redisClient.brPop('telemetry:events', 5);
      if (!res) continue; // timeout
      const payload = res.element ?? res.value ?? res[1];
      let msg;
      try {
        msg = JSON.parse(payload);
      } catch (e) {
        console.warn('Invalid JSON telemetry payload', payload);
        continue;
      }

      // Deduce some required fields with fallbacks
      const ts = msg.ts ?? Date.now();
      const graphId = msg.graphId ?? 'unknown';
      const deviceId = msg.deviceId ?? msg.device?.id ?? 'unknown-device';
      const fps = msg.fps ?? msg.stats?.fps ?? null;
      const frameTime = msg.frameTime ?? msg.stats?.frameTime ?? null;
      const gpuMem = msg.gpuMemoryUsage ?? msg.stats?.gpuMemoryUsage ?? null;
      const nodeCount = msg.nodeCount ?? msg.stats?.nodeCount ?? null;
      const edgeCount = msg.edgeCount ?? msg.stats?.edgeCount ?? null;

      // Upsert Metric node and relationships
      const cypher = `
      MERGE (d:Device {id:$deviceId})
      MERGE (g:Graph {id:$graphId})
      CREATE (m:Metric {ts:$ts})
      SET m.fps = $fps, m.frameTime = $frameTime, m.gpuMem = $gpuMem, m.nodeCount = $nodeCount, m.edgeCount = $edgeCount
      MERGE (d)-[:REPORTED]->(m)
      MERGE (g)-[:HAS_METRIC]->(m)
      RETURN m
      `;

      try {
        await session.writeTransaction(async tx => {
          await tx.run(cypher, { deviceId, graphId, ts: neo4j.int(ts), fps, frameTime, gpuMem, nodeCount, edgeCount });
        });
      } catch (e) {
        console.error('Neo4j write error', e);
      }
    }
  } finally {
    await session.close();
    await driver.close();
    await redisClient.disconnect();
  }
}

start().catch(err => {
  console.error('Telemetry consumer fatal error', err);
  process.exit(1);
});
#!/usr/bin/env node
/*
  Lightweight telemetry consumer demo:
  - Connects to Redis (uses existing env vars)
  - BRPOP from telemetry:events and processes entries
  - Demonstrates how to update Neo4j scores (pseudo-code, safe - will no-op if no Neo4j config)
*/
import Redis from 'ioredis';
import neo4j from 'neo4j-driver';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = new Redis(REDIS_URL);

const NEO_URL = process.env.NEO4J_URI || process.env.NEO4J_URL;
const NEO_USER = process.env.NEO4J_USER;
const NEO_PASS = process.env.NEO4J_PASSWORD;

let neoDriver = null;
if (NEO_URL && NEO_USER && NEO_PASS) {
  neoDriver = neo4j.driver(NEO_URL, neo4j.auth.basic(NEO_USER, NEO_PASS));
}

async function processEntry(jsonStr) {
  try {
    const entry = JSON.parse(jsonStr);
    // Example: increment a Redis ZSET score for the active device
    const key = 'telemetry:adapter:scores';
    const member = entry.gpuActive ? 'gpu' : 'cpu';
    await redis.zincrby(key, 1, member);

    // If Neo4j configured, write a minimal relationship for analytics
    if (neoDriver) {
      const session = neoDriver.session();
      try {
        await session.run(
          `MERGE (n:Device {type: $type})
           SET n.lastSeen = coalesce(n.lastSeen, 0) + 1`
          , { type: member }
        );
      } finally {
        await session.close();
      }
    }
  } catch (err) {
    console.error('failed to process entry', err);
  }
}

async function loop() {
  console.log('telemetry consumer starting...');
  while (true) {
    try {
      // BRPOP with 0 timeout blocks until an item is available
      const res = await redis.brpop('telemetry:events', 0);
      if (res && res[1]) {
        await processEntry(res[1]);
      }
    } catch (err) {
      console.error('consumer error', err);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

loop().catch((e) => {
  console.error('fatal', e);
  process.exit(1);
});
