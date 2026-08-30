import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import Redis from 'ioredis';

import { buildCacheIdentityV2, hashTextV2 } from '../../src/lib/server/cache/cache-identity-v2.js';
import {
	validateCacheExecutionReceiptV1,
	type CacheExecutionEventV1,
	type CacheExecutionReceiptV1
} from '../../src/lib/server/cache/cache-execution-receipt-v1.js';

const REPORT_PATH = resolve(process.cwd(), '..', 'docs', 'reports', 'valkey-cache-execution-receipt-v1.json');
const TTL_SECONDS = 30;

function sha256(value: string): string {
	return createHash('sha256').update(value, 'utf8').digest('hex');
}

function now(): string {
	return new Date().toISOString();
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; latencyMs: number }> {
	const start = performance.now();
	const value = await fn();
	return { value, latencyMs: Number((performance.now() - start).toFixed(3)) };
}

async function main(): Promise<void> {
	const redis = new Redis({
		host: process.env.REDIS_HOST || '127.0.0.1',
		port: Number(process.env.REDIS_PORT || 6379),
		password: process.env.REDIS_PASSWORD || 'redis',
		maxRetriesPerRequest: 1,
		lazyConnect: true
	});

	const runId = `valkey-cache-proof-${randomUUID()}`;
	const fixturePayload = JSON.stringify({ schema: 'atlas.cache-proof-fixture.v1', value: 'deterministic' });
	const payloadChecksum = sha256(fixturePayload);
	const events: CacheExecutionEventV1[] = [];
	let oldKey = '';
	let identityChecksum = '';
	let currentEpoch = 0;
	let nextEpoch = 0;

	try {
		await redis.connect();
		const rawEpoch = await redis.get('atlas:cache_epoch');
		currentEpoch = Number.parseInt(rawEpoch || '0', 10) || 0;
		const identity = buildCacheIdentityV2({
			tier: 'atlas-lru',
			kind: 'proof',
			cacheEpoch: currentEpoch,
			payloadChecksum: hashTextV2(runId),
			revisions: { cacheSalt: runId }
		});
		oldKey = identity.cacheKey;
		identityChecksum = identity.identityChecksum;
		await redis.del(oldKey);

		const first = await timed(() => redis.get(oldKey));
		const firstPttl = await redis.pttl(oldKey);
		events.push({ sequence: 1, kind: 'MISS', observedAt: now(), latencyMs: first.latencyMs, pttlMs: firstPttl });
		if (first.value !== null) throw new Error('initial proof key unexpectedly existed');

		const compute = await timed(async () => fixturePayload);
		events.push({ sequence: 2, kind: 'COMPUTE', observedAt: now(), latencyMs: compute.latencyMs, payloadChecksum });

		const write = await timed(() => redis.set(oldKey, fixturePayload, 'EX', TTL_SECONDS));
		events.push({ sequence: 3, kind: 'WRITE', observedAt: now(), latencyMs: write.latencyMs, payloadChecksum });
		if (write.value !== 'OK') throw new Error(`SET failed: ${String(write.value)}`);

		const hit = await timed(() => redis.get(oldKey));
		const hitPttl = await redis.pttl(oldKey);
		const hitChecksum = hit.value === null ? undefined : sha256(hit.value);
		events.push({ sequence: 4, kind: 'READBACK_HIT', observedAt: now(), latencyMs: hit.latencyMs, payloadChecksum: hitChecksum, pttlMs: hitPttl });

		const invalidation = await timed(() => redis.incr('atlas:cache_epoch'));
		nextEpoch = invalidation.value;
		events.push({ sequence: 5, kind: 'INVALIDATE', observedAt: now(), latencyMs: invalidation.latencyMs });

		const nextIdentity = buildCacheIdentityV2({
			tier: 'atlas-lru',
			kind: 'proof',
			cacheEpoch: nextEpoch,
			payloadChecksum: hashTextV2(runId),
			revisions: { cacheSalt: runId }
		});
		if (nextIdentity.cacheKey === oldKey) throw new Error('epoch invalidation did not change physical key identity');
		const post = await timed(() => redis.get(nextIdentity.cacheKey));
		const postPttl = await redis.pttl(nextIdentity.cacheKey);
		events.push({ sequence: 6, kind: 'POST_INVALIDATION_MISS', observedAt: now(), latencyMs: post.latencyMs, pttlMs: postPttl });
		if (post.value !== null) throw new Error('new epoch proof key unexpectedly existed');

		const receipt: CacheExecutionReceiptV1 = {
			schema: 'atlas.cache-execution-receipt.v1',
			runId,
			tier: 'valkey',
			identityChecksum,
			namespace: `atlas-lru:v2:e${currentEpoch}`,
			cacheKeyDigest: sha256(oldKey),
			canonicalAuthority: false,
			events,
			revisions: {},
			telemetry: {
				valkeyHitsObserved: 1,
				valkeyMissesObserved: 2,
				computeMs: events[1]?.latencyMs,
				hitReadMs: events[3]?.latencyMs
			},
			status: 'PROVEN',
			diagnostics: []
		};
		const diagnostics = validateCacheExecutionReceiptV1(receipt);
		if (diagnostics.length) {
			receipt.status = 'FAILED';
			receipt.diagnostics = diagnostics;
		}
		await mkdir(dirname(REPORT_PATH), { recursive: true });
		await writeFile(REPORT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
		console.log(JSON.stringify({ reportPath: REPORT_PATH, status: receipt.status, diagnostics, currentEpoch, nextEpoch }, null, 2));
		if (receipt.status !== 'PROVEN') process.exitCode = 1;
	} finally {
		if (oldKey) await redis.del(oldKey).catch(() => undefined);
		await redis.quit().catch(() => undefined);
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
