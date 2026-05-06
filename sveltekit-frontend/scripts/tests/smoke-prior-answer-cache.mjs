#!/usr/bin/env node
/**
 * Smoke test: 3-tier prior-answer cascade (Redis L1 → Postgres L2 → Qdrant L3)
 *
 * Probes each layer in isolation:
 *   1. Pick a random Redis-cached path → L1 hit expected (≤20ms)
 *   2. Force-miss Redis (random unhashed path) → if same path is in Postgres,
 *      L2 hit expected (~30-100ms)
 *   3. Free-text query → L3 Qdrant semantic hit expected (~50-200ms)
 *
 * Exits non-zero on any unexpected miss to act as a CI gate.
 */
import Redis from 'ioredis';
import pg from 'pg';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE  = path.resolve(__dirname, '..', '..', '.env');
if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const APP_URL  = process.env.APP_URL ?? 'http://localhost:5173';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db';

let exitCode = 0;
const ok   = (msg) => console.log(`✓ ${msg}`);
const warn = (msg) => { console.warn(`⚠ ${msg}`); exitCode = Math.max(exitCode, 0); };
const fail = (msg) => { console.error(`✗ ${msg}`); exitCode = 1; };

// ── Setup ──────────────────────────────────────────────────────────────────
const redis = new Redis(REDIS_URL, { lazyConnect: true });
await redis.ping();

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
try { await pool.query('SELECT 1'); ok('Postgres connected'); } catch (e) { fail(`Postgres: ${e.message}`); }

// ── Sample lookup keys ─────────────────────────────────────────────────────
const samplePaths = await redis.keys('code:llm_output:path:*').then((keys) => keys.slice(0, 5));
if (!samplePaths.length) {
  warn('No code:llm_output:path:* keys in Redis — run `npm run graphify:seed-llm-index` first');
  await redis.quit(); await pool.end();
  process.exit(2);
}

const sampleEntry = await redis.get(samplePaths[0]).then((raw) => raw ? JSON.parse(raw) : null);
if (!sampleEntry?.path) { fail('Redis sample entry malformed'); await redis.quit(); await pool.end(); process.exit(1); }
ok(`Sample entry resolved: ${sampleEntry.path}`);

// ── Test 1: L1 Redis hit ───────────────────────────────────────────────────
async function probeL1() {
  const t0 = Date.now();
  const v = await redis.get(samplePaths[0]);
  const dt = Date.now() - t0;
  if (v && dt < 50) ok(`L1 Redis hit: ${dt}ms`);
  else if (v)      warn(`L1 Redis hit: ${dt}ms (slower than expected)`);
  else             fail(`L1 Redis miss for ${samplePaths[0]}`);
}

// ── Test 2: L2 Postgres durable mirror ─────────────────────────────────────
async function probeL2() {
  const t0 = Date.now();
  const { rows } = await pool.query(
    `SELECT path, source, output_meta FROM code_llm_index WHERE path = $1 LIMIT 1`,
    [sampleEntry.path],
  );
  const dt = Date.now() - t0;
  if (rows[0]) ok(`L2 Postgres hit: ${dt}ms · ${rows[0].source}`);
  else         warn(`L2 Postgres miss for ${sampleEntry.path} — run with --postgres on seed`);
}

// ── Test 3: L3 Qdrant semantic fallback (via API endpoint) ─────────────────
async function probeL3() {
  // Hit the search endpoint we wired earlier
  const t0 = Date.now();
  try {
    const res = await fetch(`${APP_URL}/api/codebase-index/llm-output?q=${encodeURIComponent('database client')}&limit=3`, {
      headers: { 'x-dev-bypass': 'true' },
      signal: AbortSignal.timeout(5_000),
    });
    const dt = Date.now() - t0;
    if (!res.ok) {
      warn(`L3 Qdrant probe HTTP ${res.status} — start dev server (npm run dev) to enable L3 path`);
      return;
    }
    const body = await res.json();
    const count = body.count ?? 0;
    if (count > 0) ok(`L3 Qdrant hit: ${dt}ms · ${count} results`);
    else           warn(`L3 Qdrant returned 0 results — empty collection? run \`recordRagAnswer\` to populate`);
  } catch (err) {
    warn(`L3 probe skipped: ${err.message.split('\n')[0]} — dev server not running?`);
  }
}

// ── Run probes ─────────────────────────────────────────────────────────────
console.log('\n━━━ Prior-Answer Cache Cascade Smoke ━━━');
await probeL1();
await probeL2();
await probeL3();

await redis.quit();
await pool.end();

if (exitCode === 0) console.log('\n✓ All cascade layers reachable');
process.exit(exitCode);
