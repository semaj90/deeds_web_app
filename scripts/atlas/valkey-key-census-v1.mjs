// Read-only Valkey key census (G60 companion). Issues only SCAN, TTL, INFO and CONFIG GET.
// Never prints key values. Writes one receipt under .tmp/atlas/valkey-census/.
// Run from the repo root with REDIS_HOST/REDIS_PORT/REDIS_PASSWORD in the environment:
//   node scripts/atlas/valkey-key-census-v1.mjs [--sample=2000] [--max-keys=300000]
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(ROOT, 'sveltekit-frontend', 'package.json'));
const Redis = require('ioredis');

const arg = (name, fallback) => {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
	return hit ? Number(hit.split('=')[1]) : fallback;
};
const SAMPLE = arg('sample', 2000);
const MAX_KEYS = arg('max-keys', 300000);

// Namespace = first segment, or the first two segments for known multi-segment owners.
const TWO_SEGMENT = new Set(['code', 'bull', 'pa', 'gpu', 'atlas', 'workflow', 'bitfrost', 'bifrost', 'ace']);
function namespaceOf(key) {
	const parts = key.split(':');
	return TWO_SEGMENT.has(parts[0]) && parts.length > 1 ? `${parts[0]}:${parts[1]}` : parts[0];
}

const redis = new Redis({
	host: process.env.REDIS_HOST || '127.0.0.1',
	port: Number(process.env.REDIS_PORT || 6379),
	password: process.env.REDIS_PASSWORD,
	lazyConnect: true,
	enableOfflineQueue: false,
	maxRetriesPerRequest: 1,
	retryStrategy: () => null,
});

function parseInfo(text) {
	const out = {};
	for (const line of text.split(/\r?\n/)) {
		const i = line.indexOf(':');
		if (i > 0 && !line.startsWith('#')) out[line.slice(0, i)] = line.slice(i + 1);
	}
	return out;
}

async function main() {
	await redis.connect();
	const pong = await redis.ping();
	const memory = parseInfo(await redis.info('memory'));
	const stats = parseInfo(await redis.info('stats'));
	const keyspace = parseInfo(await redis.info('keyspace'));
	const policy = await redis.config('GET', 'maxmemory-policy');

	const namespaces = new Map();
	let total = 0;
	let cursor = '0';
	const sampleKeys = [];
	do {
		const [next, batch] = await redis.scan(cursor, 'COUNT', 1000);
		cursor = next;
		for (const key of batch) {
			total += 1;
			const ns = namespaceOf(key);
			namespaces.set(ns, (namespaces.get(ns) || 0) + 1);
			if (sampleKeys.length < SAMPLE) sampleKeys.push(key);
		}
		if (total >= MAX_KEYS) break;
	} while (cursor !== '0');

	// TTL on a bounded sample only. Values are never read.
	let noTtl = 0;
	const noTtlByNamespace = new Map();
	if (sampleKeys.length > 0) {
		const pipe = redis.pipeline();
		for (const key of sampleKeys) pipe.ttl(key);
		const results = await pipe.exec();
		results.forEach(([, ttl], i) => {
			if (ttl === -1) {
				noTtl += 1;
				const ns = namespaceOf(sampleKeys[i]);
				noTtlByNamespace.set(ns, (noTtlByNamespace.get(ns) || 0) + 1);
			}
		});
	}

	const hits = Number(stats.keyspace_hits || 0);
	const misses = Number(stats.keyspace_misses || 0);
	const body = {
		schema: 'atlas.valkey-key-census.v1',
		generatedAt: new Date().toISOString(),
		ping: pong,
		endpoint: { host: process.env.REDIS_HOST || '127.0.0.1', port: Number(process.env.REDIS_PORT || 6379) },
		keyspace: { dbs: keyspace, scannedKeys: total, truncatedAt: total >= MAX_KEYS ? MAX_KEYS : null },
		namespaces: Object.fromEntries([...namespaces.entries()].sort((a, b) => b[1] - a[1])),
		ttl: { sampleSize: sampleKeys.length, withoutTtl: noTtl, withoutTtlByNamespace: Object.fromEntries(noTtlByNamespace) },
		memory: { usedMemoryHuman: memory.used_memory_human, maxmemoryHuman: memory.maxmemory_human, maxmemoryPolicy: policy[1] },
		counters: {
			keyspaceHits: hits,
			keyspaceMisses: misses,
			hitRatio: hits + misses > 0 ? Number((hits / (hits + misses)).toFixed(4)) : null,
			note: 'Server-wide lifetime counters since last restart. Not BitFrost hit rate.',
		},
		canonicalAuthority: false,
		writesPerformed: false,
	};
	const checksum = `sha256:${createHash('sha256').update(JSON.stringify(body)).digest('hex')}`;
	const receipt = { ...body, receiptChecksum: checksum };

	const dir = path.join(ROOT, '.tmp', 'atlas', 'valkey-census');
	mkdirSync(dir, { recursive: true });
	const file = path.join(dir, `valkey-key-census-${body.generatedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}.json`);
	writeFileSync(file, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
	console.log(JSON.stringify({ receipt: path.relative(ROOT, file).split(path.sep).join('/'), scannedKeys: total, namespaces: Object.keys(receipt.namespaces).length, sampleWithoutTtl: noTtl, receiptChecksum: checksum }, null, 2));
}

main()
	.catch((err) => {
		console.error(`[valkey-key-census] ${err.message}`);
		process.exitCode = 1;
	})
	.finally(() => redis.quit().catch(() => {}));
