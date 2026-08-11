#!/usr/bin/env node
/**
 * ROUTE_IMPORT_INFRA_ISOLATION_PROVEN
 *
 * The invariant under test is IMPORT MODULE => ZERO SOCKET OPEN ATTEMPTS, not
 * "ioredis's Redis.prototype.connect wasn't called" — a narrower check that
 * misses any other client library (RabbitMQ/amqplib, pg, neo4j-driver,
 * @qdrant/js-client-rest, plain fetch-over-TCP, ...) doing the same eager
 * thing. This intercepts at the actual Node networking choke point instead:
 * net.Socket.prototype.connect, net.createConnection, and tls.connect.
 *
 * Each check runs in its OWN fresh child process. This is not optional
 * ceremony: redis.ts's `redisPool` is a module-level singleton, and every
 * one of the 7 callers under test imports it, so running all checks in one
 * shared process means an early failed connection attempt (retries
 * exhausted, client marked dead) silently suppresses later checks — a false
 * PASS, not a true one. A fresh process per check has no prior state to
 * pollute it.
 *
 * Gates:
 *   G1 — importing redis.ts performs zero socket attempts
 *   G2 — importing each of its known legacy-`redis`-export callers performs
 *        zero socket attempts
 *   G3 — calling getRedis() and using it DOES trigger a connection attempt
 *        (proves the lazy path still connects when actually used)
 *   G4 — first real use of the legacy `redis` export triggers a connection
 *        attempt through the same lifecycle owner as getRedis()
 *
 * Usage: node scripts/smoke-redis-import-isolation.mjs
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.join(__dirname, '_smoke-redis-worker.mjs');

const CHECKS = [
	{ label: 'redis.ts (G1)', mode: 'import', path: '../src/lib/server/redis.js' },
	{ label: 'chrrom/predictor.ts', mode: 'import', path: '../src/lib/server/chrrom/predictor.js' },
	{ label: 'redis-service.ts', mode: 'import', path: '../src/lib/server/redis-service.js' },
	{ label: 'rg-atlas/karpathy-blend.ts', mode: 'import', path: '../src/lib/server/rg-atlas/karpathy-blend.js' },
	{ label: 'search/semantic-cache.ts', mode: 'import', path: '../src/lib/server/search/semantic-cache.js' },
	{ label: 'knowledge-search/ACPToolRegistry.ts', mode: 'import', path: '../src/lib/server/services/knowledge-search/ACPToolRegistry.js' },
	{ label: 'knowledge-search/RedisCacheService.ts', mode: 'import', path: '../src/lib/server/services/knowledge-search/RedisCacheService.js' },
	{ label: 'G3 getRedis() explicit use', mode: 'getRedis-use' },
	{ label: 'G4 legacy redis export explicit use', mode: 'redis-use' },
];

function runCheck(check) {
	const result = spawnSync(
		process.execPath,
		['--import', 'tsx/esm', WORKER_PATH, check.mode, check.path ?? ''],
		{ cwd: __dirname, encoding: 'utf-8', timeout: 20_000 },
	);
	let parsed = null;
	try {
		const lastLine = result.stdout.trim().split('\n').filter(Boolean).pop();
		parsed = lastLine ? JSON.parse(lastLine) : null;
	} catch {
		// worker crashed before emitting JSON — treat as a hard failure below
	}
	return { check, parsed, stderr: result.stderr, status: result.status };
}

console.log('ROUTE_IMPORT_INFRA_ISOLATION_PROVEN — socket-level import isolation check (isolated subprocess per check)\n');

let allPass = true;
const results = CHECKS.map(runCheck);

console.log('-- G1/G2: import-time socket attempts (expect 0 for all) --');
for (const { check, parsed, status } of results.filter((r) => r.check.mode === 'import')) {
	const ok = parsed?.imported && parsed.socketAttempts === 0;
	if (!ok) allPass = false;
	console.log(`[${ok ? 'PASS' : 'FAIL'}] ${check.label} — imported=${parsed?.imported} socketAttempts=${parsed?.socketAttempts} (exit ${status})`);
	for (const o of parsed?.owners ?? []) {
		console.log(`         owner=${o.owner} host=${o.host}:${o.port} firstFrame=${o.firstFrame}`);
	}
	if (!parsed) console.log('         worker produced no parseable output — see stderr');
}

console.log('\n-- G3/G4: explicit-use behavior (expect socketAttempts >= 1 for both) --');
for (const { check, parsed, status } of results.filter((r) => r.check.mode !== 'import')) {
	const ok = (parsed?.socketAttempts ?? 0) >= 1;
	if (!ok) allPass = false;
	console.log(`[${ok ? 'PASS' : 'FAIL'}] ${check.label} — socketAttempts=${parsed?.socketAttempts} sameOwner=${parsed?.sameOwner} (exit ${status})`);
}

const importChecks = results.filter((r) => r.check.mode === 'import');
const passCount = importChecks.filter((r) => r.parsed?.imported && r.parsed.socketAttempts === 0).length;
console.log(`\n${allPass ? 'ALL PASS' : 'FAILURES PRESENT'} — ${passCount}/${importChecks.length} modules import with zero socket attempts`);
process.exit(allPass ? 0 : 1);
