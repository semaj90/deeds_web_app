#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Redis from 'ioredis';
import pg from 'pg';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const OUT_DIR = path.resolve('memory/exports');
const JSON_OUT = path.join(OUT_DIR, 'engram-transition-memory.json');
const JSONL_OUT = path.join(OUT_DIR, 'engram-transition-memory.jsonl');
const { Pool } = pg;

function parseZrevWithScores(raw) {
  const out = [];
  for (let i = 0; i < raw.length - 1; i += 2) {
    out.push({ hash: raw[i], score: Number(raw[i + 1] || 0) });
  }
  return out;
}

async function scanKeys(redis, pattern) {
  const keys = [];
  let cursor = '0';
  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
    keys.push(...batch);
    cursor = next;
  } while (cursor !== '0');
  return keys;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const redis = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 3000 });
  await redis.connect();

  const bigramKeys = (await scanKeys(redis, 'ace:engram:bigram:*')).sort();
  const redisRecords = [];
  const records = [];

  for (const bigramKey of bigramKeys) {
    const prevHash = bigramKey.split(':').pop();
    if (!prevHash) continue;
    const prevQuery = await redis.get(`ace:engram:query:${prevHash}`).catch(() => null);
    const transitions = parseZrevWithScores(await redis.zrevrange(bigramKey, 0, 199, 'WITHSCORES'));

    for (const transition of transitions) {
      const nextQuery = await redis.get(`ace:engram:query:${transition.hash}`).catch(() => null);
      const nextBmu = await redis.get(`ace:engram:query-bmu:${transition.hash}`).catch(() => null);
      redisRecords.push({
        cacheKey: `ace:engram:transition:${prevHash}:${transition.hash}`,
        prevHash,
        prevQuery,
        nextHash: transition.hash,
        nextQuery,
        score: transition.score,
        hitCount: Math.round(transition.score),
        nextBmu,
        source: 'engram-transition',
      });
    }
  }

  if (redisRecords.length > 0) {
    records.push(...redisRecords);
  } else {
    const timelineRecords = await exportFromContextTimeline();
    records.push(...timelineRecords);
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    redisUrl: REDIS_URL,
    databaseUrl: DATABASE_URL,
    bigramKeyCount: bigramKeys.length,
    recordCount: records.length,
    records,
  };

  await writeFile(JSON_OUT, JSON.stringify(payload, null, 2), 'utf8');
  await writeFile(
    JSONL_OUT,
    records.map((record) => JSON.stringify(record)).join('\n') + (records.length ? '\n' : ''),
    'utf8',
  );

  await redis.disconnect();
  console.log(`[engram-export] wrote ${JSON_OUT}`);
  console.log(`[engram-export] wrote ${JSONL_OUT}`);
  console.log(`[engram-export] bigramKeys=${bigramKeys.length} records=${records.length}`);
}

async function exportFromContextTimeline() {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
  try {
    const result = await pool.query(
      `WITH ordered AS (
         SELECT
           session_id,
           event_type,
           pipeline,
           signal,
           payload,
           created_at,
           lag(event_type) OVER (PARTITION BY session_id ORDER BY created_at, id) AS prev_event_type,
           lag(payload) OVER (PARTITION BY session_id ORDER BY created_at, id) AS prev_payload
         FROM context_timeline
         WHERE event_type IN ('cache_miss','atlas_lookup','qdrant_hit','graph_expand','turbovec_rerank','gemma4_response','multi_lane_retrieval','tool_call','summary','research','agent_run_ingested','synthesis_handoff')
       )
       SELECT * FROM ordered
       WHERE prev_event_type IS NOT NULL
       ORDER BY session_id, created_at ASC`,
    );

    return result.rows.map((row) => ({
      cacheKey: `context_timeline:${row.session_id}:${row.prev_event_type}:${row.event_type}:${String(row.created_at)}`,
      source: 'context_timeline',
      sessionId: row.session_id,
      fromState: row.prev_event_type,
      toState: row.event_type,
      pipeline: row.pipeline,
      signal: row.signal,
      payloadHint: {
        prevSignal: row.prev_payload?.signal ?? null,
        nextSignal: row.payload?.signal ?? null,
        prevKeys: row.prev_payload ? Object.keys(row.prev_payload) : [],
        nextKeys: row.payload ? Object.keys(row.payload) : [],
      },
      score: 1,
      hitCount: 1,
    }));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`[engram-export] failed: ${err.message}`);
  process.exit(1);
});
