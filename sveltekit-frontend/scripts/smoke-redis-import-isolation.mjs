#!/usr/bin/env node
/**
 * ROUTE_IMPORT_INFRA_ISOLATION_PROVEN — gates G1/G2.
 *
 * Proves that importing src/lib/server/redis.ts, and importing each of its
 * known callers of the legacy `redis` export, performs ZERO real network
 * connection during module evaluation.
 *
 * Deterministic, not timing-based: monkey-patches ioredis's Redis.prototype
 * .connect (the single choke point every connection path — lazyConnect or
 * not — must go through before opening a socket) to count invocations, then
 * imports each target and checks whether the counter moved. A module that
 * merely *defines* a lazy client/Proxy without touching it passes with
 * connectCallCount === 0; a module with a genuine eager top-level connect
 * (like the old `export const redis = redisPool.getConnection()`) fails
 * with connectCallCount > 0.
 *
 * Usage: node scripts/smoke-redis-import-isolation.mjs
 */

import Redis from 'ioredis';

let connectCallCount = 0;
Redis.prototype.connect = function patchedConnect() {
  connectCallCount += 1;
  // Never let it actually complete a real socket attempt in this smoke run —
  // return a rejected promise immediately so nothing hangs waiting on I/O.
  return Promise.reject(new Error('smoke-redis-import-isolation: connect() blocked by design'));
};

const TARGETS = [
  { label: 'redis.ts (G1)', path: '../src/lib/server/redis.js' },
  { label: 'chrrom/predictor.ts', path: '../src/lib/server/chrrom/predictor.js' },
  { label: 'redis-service.ts', path: '../src/lib/server/redis-service.js' },
  { label: 'rg-atlas/karpathy-blend.ts', path: '../src/lib/server/rg-atlas/karpathy-blend.js' },
  { label: 'search/semantic-cache.ts', path: '../src/lib/server/search/semantic-cache.js' },
  { label: 'knowledge-search/ACPToolRegistry.ts', path: '../src/lib/server/services/knowledge-search/ACPToolRegistry.js' },
  { label: 'knowledge-search/RedisCacheService.ts', path: '../src/lib/server/services/knowledge-search/RedisCacheService.js' },
];

const results = [];
for (const target of TARGETS) {
  const before = connectCallCount;
  let imported = false;
  let importError = null;
  try {
    await import(target.path);
    imported = true;
  } catch (err) {
    importError = err;
  }
  const connectAttemptsDuringImport = connectCallCount - before;
  results.push({ ...target, imported, importError, connectAttemptsDuringImport });
}

console.log('ROUTE_IMPORT_INFRA_ISOLATION_PROVEN — import-time network isolation check (deterministic, connect()-call-counted)\n');

let allPass = true;
for (const r of results) {
  const status = r.imported && r.connectAttemptsDuringImport === 0 ? 'PASS' : 'FAIL';
  if (status === 'FAIL') allPass = false;
  console.log(
    `[${status}] ${r.label} — imported=${r.imported} connectAttemptsDuringImport=${r.connectAttemptsDuringImport}` +
      (r.importError ? ` error=${r.importError.message}` : ''),
  );
}

console.log(`\n${allPass ? 'ALL PASS' : 'FAILURES PRESENT'} — ${results.filter((r) => r.imported && r.connectAttemptsDuringImport === 0).length}/${results.length} modules import with zero real connect() calls`);
process.exit(allPass ? 0 : 1);
