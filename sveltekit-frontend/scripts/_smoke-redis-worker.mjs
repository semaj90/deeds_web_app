#!/usr/bin/env node
/**
 * Isolated single-check worker for smoke-redis-import-isolation.mjs.
 * Runs exactly one check in a fresh process (no shared redisPool state from
 * any other check) and prints a single JSON line to stdout as its result.
 *
 * Args: <mode> <targetPath?>
 *   mode=import        — import targetPath, report socket attempts during import
 *   mode=getRedis-use   — import redis.ts, call getRedis(), use it, report attempts
 *   mode=redis-use       — import redis.ts, use the legacy `redis` export, report attempts
 */

import net from 'node:net';
import tls from 'node:tls';

const PORT_OWNERS = {
	6379: 'REDIS_VALKEY',
	6380: 'REDIS_VALKEY',
	5672: 'RABBITMQ_AMQP',
	15672: 'RABBITMQ_AMQP',
	5432: 'POSTGRES',
	5433: 'POSTGRES',
	5434: 'POSTGRES',
	7687: 'NEO4J',
	7474: 'NEO4J',
	6333: 'QDRANT',
	6334: 'QDRANT',
	8090: 'HTTP_MODEL',
	11434: 'HTTP_MODEL',
	8100: 'HTTP_MODEL',
};

function classifyOwner(port, stack) {
	if (port && PORT_OWNERS[port]) return PORT_OWNERS[port];
	const s = stack ?? '';
	if (/ioredis/i.test(s)) return 'REDIS_VALKEY';
	if (/amqplib/i.test(s)) return 'RABBITMQ_AMQP';
	if (/[\\/]pg[\\/]|node-postgres/i.test(s)) return 'POSTGRES';
	if (/neo4j-driver/i.test(s)) return 'NEO4J';
	if (/@qdrant/i.test(s)) return 'QDRANT';
	return 'OTHER';
}

function firstAppFrame(stack) {
	const lines = (stack ?? '').split('\n').slice(1);
	const appFrame = lines.find((l) => l.includes('sveltekit-frontend') && !l.includes('node_modules'));
	return (appFrame ?? lines[1] ?? '').trim();
}

const attempts = [];
function recordAttempt(host, port) {
	const stack = new Error().stack ?? '';
	attempts.push({ host, port, owner: classifyOwner(port, stack), firstFrame: firstAppFrame(stack) });
}

net.Socket.prototype.connect = function patchedSocketConnect(...args) {
	const opts = typeof args[0] === 'object' ? args[0] : { host: args[1], port: args[0] };
	recordAttempt(opts?.host, opts?.port);
	queueMicrotask(() => this.emit('error', new Error('smoke worker: socket connect blocked by design')));
	return this;
};
net.createConnection = function patchedCreateConnection(...args) {
	const opts = typeof args[0] === 'object' ? args[0] : { host: args[1], port: args[0] };
	recordAttempt(opts?.host, opts?.port);
	const sock = new net.Socket();
	queueMicrotask(() => sock.emit('error', new Error('smoke worker: createConnection blocked by design')));
	return sock;
};
tls.connect = function patchedTlsConnect(...args) {
	const opts = typeof args[0] === 'object' ? args[0] : { host: args[1], port: args[0] };
	recordAttempt(opts?.host, opts?.port);
	const sock = new net.Socket();
	queueMicrotask(() => sock.emit('error', new Error('smoke worker: tls.connect blocked by design')));
	return sock;
};

const [, , mode, targetPath] = process.argv;

async function main() {
	if (mode === 'import') {
		let imported = false;
		try {
			await import(targetPath);
			imported = true;
		} catch {
			// Import failure is reported via `imported: false`; attempts[] still valid.
		}
		// Drain: some modules kick off fire-and-forget async initialization at
		// module scope (e.g. `this.initializeRedis()` called but not awaited in
		// a constructor invoked at import time). `await import(...)` resolving
		// only proves synchronous module evaluation finished, not that queued
		// microtasks/macrotasks from such side effects have run. Give them a
		// window to fire before declaring "zero socket attempts" — otherwise a
		// real eager-connect bug can read as a false PASS purely from timing.
		await new Promise((resolve) => setTimeout(resolve, 200));
		return { imported, socketAttempts: attempts.length, owners: attempts };
	}

	if (mode === 'getRedis-use') {
		const { getRedis } = await import('../src/lib/server/redis.js');
		const client = getRedis();
		try {
			await client.get('smoke-g3-probe');
		} catch {
			// Expected — socket is blocked by design.
		}
		return { socketAttempts: attempts.length, owners: attempts };
	}

	if (mode === 'redis-use') {
		const { redis, getRedis } = await import('../src/lib/server/redis.js');
		try {
			await redis.get('smoke-g4-probe');
		} catch {
			// Expected.
		}
		const sameOwner = getRedis() === getRedis();
		return { socketAttempts: attempts.length, owners: attempts, sameOwner };
	}

	throw new Error(`Unknown mode: ${mode}`);
}

main()
	.then((result) => {
		console.log(JSON.stringify(result));
		process.exit(0);
	})
	.catch((err) => {
		console.log(JSON.stringify({ workerError: err.message, socketAttempts: attempts.length, owners: attempts }));
		process.exit(1);
	});
