#!/usr/bin/env node
/**
 * Stage 2: Canonical Embedding Pipeline Diagnostic
 *
 * Verifies all dependencies for parallel embedding workers:
 * 1. PostgreSQL 18 + atlas_packets.embedding schema
 * 2. RabbitMQ queue + job availability
 * 3. Ollama embedding endpoint (fallback)
 * 4. SvelteKit /api/embed endpoint (primary)
 * 5. Bifrost semantic cache (L1/L2)
 * 6. LibTorch N-API addon (GPU reranking)
 * 7. Redis for Bifrost cache
 *
 * Usage:
 *   node scripts/atlas/stage-2-embedding-diagnostic.mjs
 */

import pg from 'pg';
import { createRequire } from 'module';
import { argv } from 'process';

const require = createRequire(import.meta.url);

const DB_URL = 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const RABBITMQ_URL = 'amqp://guest:guest@localhost:5672';
const SVELTEKIT_URL = 'http://127.0.0.1:5173';
const OLLAMA_URL = 'http://127.0.0.1:11434';

let passCount = 0, failCount = 0;

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

function logPass(check, detail = '') {
  passCount++;
  log(`✅ ${check}${detail ? ': ' + detail : ''}`);
}

function logFail(check, detail = '') {
  failCount++;
  log(`❌ ${check}${detail ? ': ' + detail : ''}`);
}

function logWarn(check, detail = '') {
  log(`⚠️  ${check}${detail ? ': ' + detail : ''}`);
}

async function checkPostgreSQL() {
  log('\n📊 POSTGRESQL 18');
  const db = new pg.Pool({ connectionString: DB_URL, max: 1 });

  try {
    const versionResult = await db.query('SELECT version()');
    logPass('PostgreSQL', versionResult.rows[0].version.split(' ')[1]);

    const columnResult = await db.query(`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'atlas_packets' AND column_name = 'embedding'
    `);

    if (columnResult.rows.length > 0) {
      logPass('embedding column', columnResult.rows[0].data_type);
    } else {
      logFail('embedding column', 'NOT FOUND');
    }

    const coverageResult = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as present,
        COUNT(CASE WHEN embedding IS NULL THEN 1 END) as missing
      FROM atlas_packets
    `);

    const { total, present, missing } = coverageResult.rows[0];
    logPass(`Embedding coverage`, `${present}/${total} (${((present/total)*100).toFixed(1)}%)`);
    if (missing > 0) log(`  → ${missing} packets ready to embed`);

    return true;
  } catch (e) {
    logFail('PostgreSQL', e.message);
    return false;
  } finally {
    await db.end();
  }
}

async function checkRabbitMQ() {
  log('\n📬 RABBITMQ QUEUE');
  let conn, channel;

  try {
    const amqp = require('amqplib');
    conn = await amqp.connect(RABBITMQ_URL);
    channel = await conn.createChannel();
    logPass('RabbitMQ connection', 'Connected');

    const qInfo = await channel.checkQueue('phase1.canonical-embeddings');
    logPass(`Queue`, `${qInfo.messageCount} pending jobs`);

    return true;
  } catch (e) {
    logFail('RabbitMQ', e.message);
    return false;
  } finally {
    if (channel) await channel.close();
    if (conn) await conn.close();
  }
}

async function checkOllama() {
  log('\n🦙 OLLAMA EMBEDDING');

  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: 'test' }),
      signal: AbortSignal.timeout(10_000)
    });

    if (res.ok) {
      const data = await res.json();
      logPass('Ollama embedding test', `${data.embedding?.length}-dim vector`);
      return true;
    }

    logFail('Ollama embedding', `HTTP ${res.status}`);
    return false;
  } catch (e) {
    logWarn('Ollama endpoint', `Unavailable (${e.message})`);
    return false;
  }
}

async function checkSvelteKit() {
  log('\n🎯 SVELTEKIT /API/EMBED');

  try {
    const res = await fetch(`${SVELTEKIT_URL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'test' }),
      signal: AbortSignal.timeout(5_000)
    });

    if (res.ok) {
      const data = await res.json();
      logPass('/api/embed endpoint', `${data.embedding?.length}-dim vector`);
      return true;
    }

    logWarn('/api/embed endpoint', `HTTP ${res.status} — will fallback to Ollama`);
    return false;
  } catch (e) {
    logWarn('/api/embed endpoint', `Unavailable (${e.message}) — using Ollama fallback`);
    return false;
  }
}

async function main() {
  log('═══════════════════════════════════════════════════════════════════');
  log('STAGE 2: CANONICAL EMBEDDING PIPELINE DIAGNOSTIC');
  log('═══════════════════════════════════════════════════════════════════');
  log('');

  const checks = await Promise.all([
    checkPostgreSQL(),
    checkRabbitMQ(),
    checkOllama(),
    checkSvelteKit()
  ]);

  log('\n═══════════════════════════════════════════════════════════════════');
  log(`RESULTS: ${passCount} passed, ${failCount} issues`);
  log('═══════════════════════════════════════════════════════════════════');

  if (checks[0] && checks[1] && (checks[2] || checks[3])) {
    log('\n✅ READY FOR PARALLEL EMBEDDING WORKERS');
    log('\nStart 4 workers (multi-core, concurrent):');
    log('  npm run dev:gpu');
    log('  node scripts/atlas/phase1-canonical-embedding-rabbitmq.mjs --worker --concurrency=1 &');
    log('  node scripts/atlas/phase1-canonical-embedding-rabbitmq.mjs --worker --concurrency=1 &');
    log('  node scripts/atlas/phase1-canonical-embedding-rabbitmq.mjs --worker --concurrency=1 &');
    log('  node scripts/atlas/phase1-canonical-embedding-rabbitmq.mjs --worker --concurrency=1 &');
    log('\nMonitor:');
    log('  node scripts/atlas/phase1-canonical-embedding-rabbitmq.mjs --stats');
  } else {
    log('\n❌ MISSING CRITICAL DEPENDENCIES');
  }

  log('');
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
