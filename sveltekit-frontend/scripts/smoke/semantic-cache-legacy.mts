#!/usr/bin/env node
import crypto from 'node:crypto';
import process from 'node:process';

import {
	buildSemanticCacheKey,
	checkSemanticCache,
	getSemanticCacheRecordByKey,
	saveToSemanticCache,
} from '../../src/lib/server/cache/semantic-cache.ts';
import { redisPool } from '../../src/lib/server/redis.ts';

function fail(message: string): never {
	console.error(`FAIL: ${message}`);
	process.exit(1);
}

async function main(): Promise<void> {
	try {
		const suffix = crypto.randomUUID().slice(0, 12);
		const prompt = `Legacy semantic cache smoke ${suffix}`;
		const response = `Cached response ${suffix}`;
		const model = 'gemma4-rotorquant:latest';
		const queryHash = crypto.createHash('sha256').update(prompt).digest('hex');
		const semanticCacheKey = buildSemanticCacheKey(queryHash, model, 'bifrost/ollama');

		await saveToSemanticCache(prompt, response, model);

		const record = await getSemanticCacheRecordByKey(semanticCacheKey);
		if (!record) {
			fail('Expected generic semantic cache record to be stored.');
		}

		if (record.semanticCacheKey !== semanticCacheKey) {
			fail('Stored semantic cache record key does not match.');
		}

		const hit = await checkSemanticCache(prompt, model);
		if (!hit || hit.response !== response) {
			fail('Legacy semantic cache did not return the stored response.');
		}

		console.log('Legacy semantic cache smoke passed.');
		console.log(
			JSON.stringify(
				{
					queryHash,
					semanticCacheKey,
					record,
					hit,
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
	console.error('Legacy semantic cache smoke failed:', error);
	process.exit(1);
});
