#!/usr/bin/env node
/**
 * smoke-query-router.mjs
 *
 * End-to-end smoke test for the query router (query-router.ts).
 * Calls the live /api/ace/route endpoint if the dev server is up,
 * OR validates the individual lane dependencies directly.
 *
 * Run: node scripts/smoke/smoke-query-router.mjs [--query "your query text"]
 */

import Redis from 'ioredis';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const queryArg = argv[argv.indexOf('--query') + 1] || 'where is Redis Valkey cache config wired?';
import path from 'node:path';

function loadEnv() {
  const e = { ...process.env };
  const p = path.resolve(process.cwd(), 'sveltekit-frontend/.env');
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !e[m[1]]) e[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  const rootEnv = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(rootEnv)) {
    for (const line of fs.readFileSync(rootEnv, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !e[m[1]]) e[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return e;
}
const env = loadEnv();
const DEV_URL = env.DEV_URL ?? 'http://localhost:5173';
const QDRANT_URL = env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const EMBED_URL = env.OLLAMA_EMBED_BASE_URL ?? env.OLLAMA_BASE_URL ?? 'http://localhost:11434';

let pass = 0;
let fail = 0;

function ok(label, detail) {
  console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`);
  pass++;
}
function err(label, detail) {
  console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`);
  fail++;
}

async function checkRedis() {
  const redis = new Redis({
    host: env.REDIS_HOST || '127.0.0.1',
    port: parseInt(env.REDIS_PORT || '6379', 10),
    password: env.REDIS_PASSWORD || undefined,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on('error', () => {});
  try {
    await redis.connect();
    await redis.ping();
    ok('Redis reachable');

    const queryHash = createHash('sha256').update(queryArg).digest('hex').slice(0, 16);
    const hotKey = `bitfrost:retrieval:${queryHash}`;
    const cached = await redis.get(hotKey);
    if (cached) ok('Bifrost telemetry key exists for query (Lane 1 will hit)', hotKey);
    else ok('Bifrost telemetry key absent (cold — Lane 4 will run)');

    const latestId = await redis.get('ace:packet:latest');
    if (latestId) ok('ace:packet:latest exists', latestId);
    else err('ace:packet:latest missing', 'no packets written yet');

    const indexSize = await redis.scard('ace:cluster:index');
    if (indexSize > 0) ok(`SOM cluster index has ${indexSize} entries`);
    else err('SOM cluster index empty');
  } catch (e) {
    err('Redis check failed', e.message);
  } finally {
    redis.disconnect();
  }
}

async function checkEmbed() {
  try {
    const res = await fetch(`${EMBED_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: 'smoke test' }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.embedding?.length === 768) ok(`Embed endpoint returns 768-dim vector`);
      else err('Embed endpoint', `unexpected dim: ${data.embedding?.length}`);
    } else {
      err('Embed endpoint', `HTTP ${res.status}`);
    }
  } catch (e) {
    err('Embed endpoint unreachable', e.message);
  }
}

async function checkQdrant() {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (res.ok) {
      const data = await res.json();
      const count = data.result?.points_count ?? data.result?.vectors_count ?? 0;
      if (count > 0) ok(`Qdrant codebase_chunks_768 has ${count} vectors`);
      else err('Qdrant collection empty', 'run graphify:semantic to index');
    } else {
      err('Qdrant collection check', `HTTP ${res.status}`);
    }
  } catch (e) {
    err('Qdrant unreachable', e.message);
  }
}

async function checkDevServerRoute() {
  try {
    const res = await fetch(`${DEV_URL}/api/health`, { signal: AbortSignal.timeout(3_000) });
    if (!res.ok) {
      console.log('  ℹ Dev server not running — skipping live route test');
      return;
    }

    // Try the ACE route endpoint if it exists
    const routeRes = await fetch(`${DEV_URL}/api/ace/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: queryArg, limit: 5 }),
      signal: AbortSignal.timeout(30_000),
    });
    if (routeRes.ok) {
      const data = await routeRes.json();
      if (data.packet?.packet_id) {
        ok('Live route /api/ace/route returned AceFullPacket', data.packet.packet_id);
        ok(`Route trace: ${(data.trace ?? []).map(t => `${t.lane}(${t.hit ? 'hit' : 'miss'})`).join(' → ')}`);
        if (data.packet.source_refs?.length > 0) ok(`source_refs: ${data.packet.source_refs.slice(0, 3).join(', ')}`);
        else err('source_refs empty', 'degraded packet');
      } else {
        err('Live route missing packet_id', JSON.stringify(data).slice(0, 200));
      }
    } else if (routeRes.status === 404) {
      console.log('  ℹ /api/ace/route not wired yet — skipping live route test');
    } else {
      err(`Live route HTTP ${routeRes.status}`);
    }
  } catch (e) {
    if (e.name === 'AbortError') console.log('  ℹ Dev server not running — skipping live route test');
    else err('Live route check failed', e.message);
  }
}

async function run() {
  console.log(`\n── Query Router smoke ──────────────────────────────────────`);
  console.log(`   Query: "${queryArg}"`);

  await checkRedis();
  await checkEmbed();
  await checkQdrant();
  await checkDevServerRoute();

  console.log(`\n  Result: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
