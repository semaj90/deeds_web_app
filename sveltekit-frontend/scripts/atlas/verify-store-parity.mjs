#!/usr/bin/env node
import pg from 'pg';
import { QdrantClient } from '@qdrant/js-client-rest';
import Redis from 'ioredis';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '../..');
const REPORTS_DIR = join(ROOT, 'docs/reports');

const PG_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASS = process.env.REDIS_PASSWORD || 'redis';

const results = {
  timestamp: new Date().toISOString(),
  test: 'store-parity-verification-10-chunks',
  chunks: [],
  summary: {},
  mismatches: [],
  logs: [],
};

function log(...args) {
  const msg = args.join(' ');
  console.log(msg);
  results.logs.push(`[${new Date().toISOString()}] ${msg}`);
}

function logError(...args) {
  const msg = args.join(' ');
  console.error('ERROR:', msg);
  results.logs.push(`[${new Date().toISOString()}] ERROR: ${msg}`);
}

async function step1_getPostgresChunks(pool) {
  log('\n📦 Step 1: Fetch 10 test chunks from Postgres (canonical)\n');

  const chunks = await pool.query(`
    SELECT id, relative_path, summary, summary_embedding IS NOT NULL as has_embedding, qdrant_id
    FROM codebase_chunk_index
    WHERE summary IS NOT NULL AND summary != ''
    ORDER BY id LIMIT 10
  `);

  log(`Found ${chunks.rows.length} test chunks in Postgres\n`);
  results.summary.postgres_chunks = chunks.rows.length;
  return chunks.rows;
}

async function step2_checkQdrantPayloads(qdrant, pgChunks) {
  log('\n🔍 Step 2: Check Qdrant payloads for test chunks\n');

  let found = 0, missing = 0, payloadIssues = 0;

  for (let i = 0; i < pgChunks.length; i++) {
    const pgChunk = pgChunks[i];

    try {
      if (pgChunk.qdrant_id) {
        const points = await qdrant.retrieve('codebase_chunks_768', {
          ids: [pgChunk.qdrant_id],
          with_payload: true,
        });

        if (points?.length > 0) {
          found++;
          const payload = points[0].payload || {};
          const hasPacketKey = !!payload.packet_key;
          const hasSourceRef = !!payload.source_ref;
          const hasFeatureId = !!payload.feature_id;

          if (!hasPacketKey || !hasSourceRef || !hasFeatureId) {
            payloadIssues++;
          }

          results.chunks.push({
            index: i + 1, pg_id: pgChunk.id, qdrant_id: pgChunk.qdrant_id,
            qdrant_found: true, payload_complete: hasPacketKey && hasSourceRef && hasFeatureId,
          });
        } else {
          missing++;
          results.chunks.push({
            index: i + 1, pg_id: pgChunk.id, qdrant_id: pgChunk.qdrant_id, qdrant_found: false,
          });
        }
      }
    } catch (e) {
      logError(`Chunk ${i + 1}: ${e.message}`);
    }
  }

  log(`Qdrant: ${found} found, ${missing} missing, ${payloadIssues} payload issues\n`);
  results.summary.qdrant_found = found;
  results.summary.qdrant_missing = missing;
}

async function step4_checkRedisCache(redis, pgChunks) {
  log('\n🔍 Step 4: Check Redis/BitFrost cache keys\n');

  let found = 0, missing = 0;

  for (let i = 0; i < pgChunks.length; i++) {
    const cacheKey = `bifrost:packet:${pgChunks[i].id}`;
    try {
      const cached = await redis.get(cacheKey);
      cached ? found++ : missing++;
    } catch (e) {
      logError(`Chunk ${i + 1}: ${e.message}`);
    }
  }

  log(`Redis/BitFrost: ${found} found, ${missing} missing\n`);
  results.summary.redis_found = found;
  results.summary.redis_missing = missing;
}

async function step5_populateLedger(pool, pgChunks) {
  log('\n📝 Step 5: Populate atlas_identity_ledger\n');

  let inserted = 0;

  for (const pgChunk of pgChunks) {
    try {
      await pool.query(`
        INSERT INTO atlas_identity_ledger (packet_key, qdrant_id, indexed_pg, verified_at)
        VALUES ($1, $2, true, now())
        ON CONFLICT (packet_key) DO UPDATE SET indexed_pg = true, updated_at = now()
      `, [`packet:${pgChunk.id}`, pgChunk.qdrant_id]);
      inserted++;
    } catch (e) {
      logError(`Ledger insert: ${e.message}`);
    }
  }

  log(`Inserted/updated ${inserted} ledger rows\n`);
  results.summary.ledger_rows = inserted;
}

async function main() {
  log('================================================================================');
  log('🔍 Store Parity Verification: 10-Chunk Test Set');
  log('================================================================================\n');

  if (!existsSync(REPORTS_DIR)) {
    mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const pool = new pg.Pool({ connectionString: PG_URL, max: 5 });
  const qdrant = new QdrantClient({ url: QDRANT_URL });
  const redis = new Redis({
    host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PASS,
    lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false,
  });

  const startTime = Date.now();

  try {
    await redis.connect();

    const pgChunks = await step1_getPostgresChunks(pool);
    await step2_checkQdrantPayloads(qdrant, pgChunks);
    await step4_checkRedisCache(redis, pgChunks);
    await step5_populateLedger(pool, pgChunks);

    const duration = Date.now() - startTime;

    log('\n' + '='.repeat(80));
    log('📊 PARITY SUMMARY');
    log('='.repeat(80) + '\n');

    log(`Postgres (canonical):  ${results.summary.postgres_chunks} chunks`);
    log(`Qdrant mirror:         ${results.summary.qdrant_found} found (${results.summary.qdrant_missing} missing)`);
    log(`Redis/BitFrost:        ${results.summary.redis_found} found (${results.summary.redis_missing} missing)`);
    log(`Ledger populated:      ${results.summary.ledger_rows} rows\n`);

    const coverage = {
      qdrant: ((results.summary.qdrant_found / results.summary.postgres_chunks) * 100).toFixed(1),
      redis: ((results.summary.redis_found / results.summary.postgres_chunks) * 100).toFixed(1),
    };

    log(`Store Coverage:`);
    log(`  Qdrant: ${coverage.qdrant}%`);
    log(`  Redis:  ${coverage.redis}%\n`);

    const reportPath = join(REPORTS_DIR, 'store-parity-verification-10-chunks.json');
    results.duration_ms = duration;
    writeFileSync(reportPath, JSON.stringify(results, null, 2));
    log(`Report saved: ${reportPath}\n`);

  } catch (e) {
    logError(`Fatal: ${e.message}`);
    console.error(e);
    results.fatalError = e.message;
  } finally {
    await redis.quit();
    await pool.end();
  }
}

main();
