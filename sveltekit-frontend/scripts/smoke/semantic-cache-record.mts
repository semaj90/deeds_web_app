#!/usr/bin/env node
import crypto from 'node:crypto';
import process from 'node:process';

import {
	buildSemanticCacheKey,
	getSemanticCacheRecordByKey,
	getSemanticCacheRecordByQueryHash,
	getSemanticCacheRecordsBySourceRef,
	storeSemanticCacheRecord,
	type SemanticCacheRecord,
} from '../../src/lib/server/cache/semantic-cache.ts';
import { redisPool } from '../../src/lib/server/redis.ts';

function fail(message: string): never {
	console.error(`FAIL: ${message}`);
	process.exit(1);
}

async function main(): Promise<void> {
	try {
		const suffix = crypto.randomUUID().slice(0, 12);
		const queryHash = crypto.createHash('sha256').update(`semantic-cache-record:${suffix}`).digest('hex');
		const semanticCacheKey = buildSemanticCacheKey(queryHash, 'gemma4-rotorquant:latest', 'llama-server');
		const sourceRef = `docs/phase101/semantic-record/${suffix}.md`;
		const record: SemanticCacheRecord = {
			queryHash,
			semanticCacheKey,
			model: 'gemma4-rotorquant:latest',
			provider: 'llama-server',
			sourceRefs: [sourceRef],
			chunkIds: [`chunk-${suffix}`],
			contextPackKey: `ace:ctx:${suffix}`,
			responseHash: crypto.createHash('sha256').update(`response:${suffix}`).digest('hex'),
			createdAt: new Date().toISOString(),
			ttlSeconds: 1800,
			metadata: {
				intent: 'phase101-summary-smoke',
				packetId: `sum:${suffix}`,
			},
		};

		const stored = await storeSemanticCacheRecord(record);
		if (stored.semanticCacheKey !== semanticCacheKey) {
			fail('storeSemanticCacheRecord changed the semantic cache key.');
		}

		const byKey = await getSemanticCacheRecordByKey(semanticCacheKey);
		if (!byKey) {
			fail('getSemanticCacheRecordByKey returned null.');
		}

		if (byKey.queryHash !== queryHash) {
			fail('getSemanticCacheRecordByKey returned the wrong record.');
		}

		const byQueryHash = await getSemanticCacheRecordByQueryHash(queryHash);
		if (!byQueryHash) {
			fail('getSemanticCacheRecordByQueryHash returned null.');
		}

		if (byQueryHash.semanticCacheKey !== semanticCacheKey) {
			fail('queryHash lookup returned the wrong semantic key.');
		}

		const bySourceRef = await getSemanticCacheRecordsBySourceRef(sourceRef);
		if (bySourceRef.length === 0) {
			fail('getSemanticCacheRecordsBySourceRef returned no records.');
		}

		if (!bySourceRef.some((entry) => entry.semanticCacheKey === semanticCacheKey)) {
			fail('sourceRef lookup did not return the stored record.');
		}

		console.log('Semantic cache record smoke passed.');
		console.log(
			JSON.stringify(
				{
					semanticCacheKey,
					queryHash,
					sourceRef,
					stored,
					byKey,
					byQueryHash,
					sourceRefHitCount: bySourceRef.length,
				},
				null,
				2
			)
		);
	} finally {
		await redisPool.closeAll().catch(() => {});
	}
}

main().catch((error) => {
	console.error('Semantic cache record smoke failed:', error);
	process.exit(1);
});
