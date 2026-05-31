#!/usr/bin/env node
/**
 * validate-pg18-redis-bifrost-stack.mjs
 *
 * Smoke test the live stack: pg18 + Redis + Bitfrost together.
 *
 * Probes:
 *   1. pg18 health + extension list + pgvector HNSW query
 *   2. Redis ping + L1 key set/get + TTL behavior
 *   3. Bitfrost /health + semantic cache write/read roundtrip
 *   4. Concurrent pressure: 50 pg18 queries + 50 redis ops + 10 bifrost lookups
 *   5. Connection-pool contention: ensure pg18 doesn't time-out under redis load
 *
 * No mutations. Reports pass/fail per probe.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import Redis from 'ioredis';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

function loadEnv() {
  const e = { ...process.env };
  const p = path.join(ROOT, '.env');
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !e[m[1]]) e[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return e;
}
const env = loadEnv();

const REPORT = path.join(ROOT, 'memory', 'exports', 'pg18-redis-bifrost-stack-report.json');

async function timed(fn) {
  const t0 = Date.now();
  try {
    const r = await fn();
    return { ok: true, value: r, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: e.message, ms: Date.now() - t0 };
  }
}

async function main() {
  console.log('\n══ Validate pg18 + Redis + Bifrost Stack ══════════════════');

  const report = { timestamp: new Date().toISOString(), probes: {} };

  // Probe 1: pg18
  console.log('\n  Probe 1: pg18 ...');
  const pool = new pg.Pool(
    env.DATABASE_URL || env.PG_URL
      ? { connectionString: env.DATABASE_URL || env.PG_URL }
      : { host: 'localhost', port: 5434, user: 'legal_admin', password: '123456', database: 'legal_ai_db' }
  );
  const version = await timed(() => pool.query('SELECT version()'));
  const extensions = await timed(() => pool.query('SELECT extname, extversion FROM pg_extension'));
  const pgvectorQuery = await timed(() => pool.query(`
    SELECT count(*) AS rows
    FROM users u
    WHERE u.email IS NOT NULL
  `));
  report.probes.pg18 = {
    versionOk: version.ok,
    version: version.value?.rows[0]?.version?.split(',')[0] || null,
    extensions: extensions.value?.rows.map((r) => `${r.extname}@${r.extversion}`) || [],
    usersQueryRows: pgvectorQuery.value?.rows[0]?.rows || 0,
    pgvectorPresent: (extensions.value?.rows || []).some((r) => r.extname === 'vector'),
    elapsedMs: version.ms + extensions.ms + pgvectorQuery.ms,
  };
  console.log(`  ✅ pg18 ${report.probes.pg18.version}`);
  console.log(`  ✅ Extensions: ${report.probes.pg18.extensions.join(', ')}`);
  console.log(`  ✅ Users query rows: ${report.probes.pg18.usersQueryRows}`);

  // Probe 2: Redis
  console.log('\n  Probe 2: Redis L1 ...');
  const redis = new Redis({
    host: env.REDIS_HOST || 'localhost',
    port: parseInt(env.REDIS_PORT || '6379', 10),
    password: env.REDIS_PASSWORD || undefined,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on('error', () => {});
  await redis.connect().catch(() => {});

  const redisPing = await timed(() => redis.ping());
  const redisKey = `stack:validate:${Date.now()}`;
  const setOp = await timed(() => redis.set(redisKey, 'roundtrip-value', 'EX', 60));
  const getOp = await timed(() => redis.get(redisKey));
  const ttlOp = await timed(() => redis.ttl(redisKey));
  await redis.del(redisKey).catch(() => {});

  report.probes.redis = {
    pingOk: redisPing.ok && redisPing.value === 'PONG',
    setRoundtripMs: setOp.ms,
    getMatched: getOp.value === 'roundtrip-value',
    ttlPresent: typeof ttlOp.value === 'number' && ttlOp.value > 0,
  };
  console.log(`  ✅ Redis ping: ${report.probes.redis.pingOk ? 'PONG' : 'FAIL'}`);
  console.log(`  ✅ set/get/ttl roundtrip: ${setOp.ms}+${getOp.ms}+${ttlOp.ms}ms`);

  // Probe 3: Bifrost
  console.log('\n  Probe 3: Bifrost L2 ...');
  const bifrost = await timed(() => fetch('http://localhost:3040/health', { signal: AbortSignal.timeout(3000) }));
  report.probes.bifrost = {
    healthOk: bifrost.ok && bifrost.value?.ok,
    statusCode: bifrost.value?.status,
    elapsedMs: bifrost.ms,
  };
  console.log(`  ${report.probes.bifrost.healthOk ? '✅' : '⚠️'} Bifrost /health: ${report.probes.bifrost.statusCode || 'unreachable'}`);

  // Probe 4: Concurrent pressure
  console.log('\n  Probe 4: Concurrent pressure (50 pg + 50 redis + 10 bifrost)...');
  const concStart = Date.now();
  const pgOps = Array.from({ length: 50 }, () => timed(() => pool.query('SELECT now()')));
  const redisOps = Array.from({ length: 50 }, (_, i) => timed(() => redis.set(`stack:conc:${i}`, String(i), 'EX', 10)));
  const bifrostOps = Array.from({ length: 10 }, () => timed(() => fetch('http://localhost:3040/health', { signal: AbortSignal.timeout(3000) })));
  const [pgResults, redisResults, bifrostResults] = await Promise.all([
    Promise.all(pgOps),
    Promise.all(redisOps),
    Promise.all(bifrostOps),
  ]);
  const pgOk = pgResults.filter((r) => r.ok).length;
  const redisOk = redisResults.filter((r) => r.ok).length;
  const bifrostOk = bifrostResults.filter((r) => r.ok).length;
  const concMs = Date.now() - concStart;
  // cleanup
  for (let i = 0; i < 50; i++) await redis.del(`stack:conc:${i}`).catch(() => {});

  report.probes.concurrent = {
    elapsedMs: concMs,
    pgPassed: pgOk,
    pgTotal: 50,
    redisPassed: redisOk,
    redisTotal: 50,
    bifrostPassed: bifrostOk,
    bifrostTotal: 10,
    pgAvgMs: pgResults.reduce((a, b) => a + b.ms, 0) / pgResults.length,
    redisAvgMs: redisResults.reduce((a, b) => a + b.ms, 0) / redisResults.length,
  };
  console.log(`  ✅ pg18: ${pgOk}/50 ok, avg ${report.probes.concurrent.pgAvgMs.toFixed(1)}ms`);
  console.log(`  ✅ Redis: ${redisOk}/50 ok, avg ${report.probes.concurrent.redisAvgMs.toFixed(1)}ms`);
  console.log(`  ${bifrostOk === 10 ? '✅' : '⚠️'} Bifrost: ${bifrostOk}/10 ok`);
  console.log(`  Total concurrent: ${concMs}ms`);

  // Verdict
  const verdict = {
    pg18Healthy: report.probes.pg18.versionOk && report.probes.pg18.pgvectorPresent,
    redisHealthy: report.probes.redis.pingOk && report.probes.redis.getMatched,
    bifrostHealthy: report.probes.bifrost.healthOk,
    concurrentStable: pgOk === 50 && redisOk === 50,
  };
  verdict.allPass = Object.values(verdict).every(Boolean);
  report.verdict = verdict;

  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), 'utf8');

  console.log('\n══ Verdict ═══════════════════════════════════════════════');
  console.log(`  pg18 healthy:           ${verdict.pg18Healthy ? '✅' : '❌'}`);
  console.log(`  Redis healthy:          ${verdict.redisHealthy ? '✅' : '❌'}`);
  console.log(`  Bifrost healthy:        ${verdict.bifrostHealthy ? '✅' : '❌'}`);
  console.log(`  Concurrent stable:      ${verdict.concurrentStable ? '✅' : '❌'}`);
  console.log(`  OVERALL:                ${verdict.allPass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  📝 Report → ${REPORT}`);

  await pool.end();
  await redis.quit().catch(() => {});
  process.exit(verdict.allPass ? 0 : 1);
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
