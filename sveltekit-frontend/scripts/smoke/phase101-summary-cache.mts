#!/usr/bin/env node
import crypto from 'node:crypto';
import process from 'node:process';

import {
	buildPhase101SummaryCacheText,
	readPhase101SummaryPacketBySourceRef,
	runPhase101SummaryCache,
	type Phase101SummaryCacheContext,
	type Phase101SummaryGeneration,
	type Phase101SummaryInput
} from '../../src/lib/server/cache/phase101-summary-cache.ts';
import { redisPool } from '../../src/lib/server/redis.ts';

function fail(message: string): never {
	console.error(`FAIL: ${message}`);
	process.exit(1);
}

function makeInput(): Phase101SummaryInput {
	const suffix = crypto.randomUUID().slice(0, 12);
	const smokeEmbedding = Array.from({ length: 768 }, (_, index) => {
		const byte = crypto.createHash('sha256').update(`${suffix}:${index}`).digest()[0] ?? 0;
		return (byte / 255) * 0.05;
	});
	return {
		documentId: `phase101-summary-smoke-${suffix}`,
		sections: [
			{
				title: 'Summary lane',
				content:
					'Phase 101 summary cache must reuse exact packets before semantic lookup or llama-server synthesis.'
			},
			{
				title: 'Provenance',
				content:
					'Each packet must preserve sourceRef, feature_id, and a stable query hash for replay.'
			}
		],
		keyInsights: ['exact cache first', 'semantic cache second', 'sourceRef preserved'],
		sourceRefs: [`docs/phase101/smoke/${suffix}.md`],
		featureIds: ['phase101.summary.cache.smoke'],
		laneIds: ['phase101', 'summary-cache'],
		intent: 'summary',
		promptVersion: 'phase101-summary-v1',
		model: 'gemma4-rotorquant:latest',
		semanticEmbedding: smokeEmbedding
	};
}

function makeGenerator(label: string) {
	return async (context: Phase101SummaryCacheContext): Promise<Phase101SummaryGeneration> => {
		const summary = {
			mainThemes: [
				`${label}: exact-cache summary lane`,
				`${context.intent}: ${context.sourceRefs.join(', ')}`
			],
			supportingEvidence: [
				`queryHash=${context.queryHash}`,
				`contentHash=${context.contentHash}`
			],
			gaps: [],
			contradictions: [],
			legalImplications: [`sourceRef=${context.sourceRefs[0] ?? 'n/a'}`],
			nextSteps: ['keep prompt cache exact', 'keep semantic cache warm']
		};

		return {
			rawText: JSON.stringify({ synthesis: summary }),
			synthesis: summary
		};
	};
}

async function main(): Promise<void> {
	try {
		const input = makeInput();
		const cacheText = buildPhase101SummaryCacheText(input);
		const sourceRef = input.sourceRefs?.[0];
		if (!sourceRef) fail('Smoke input did not include a sourceRef.');

		const first = await runPhase101SummaryCache(input, makeGenerator('first'));
		if (first.cache !== 'miss') {
			fail(`Expected first run to miss exact cache, got ${first.cache}.`);
		}

		const packetBySourceRef = await readPhase101SummaryPacketBySourceRef(sourceRef);
		if (!packetBySourceRef) {
			fail(`Expected packet lookup by sourceRef to return a packet for ${sourceRef}.`);
		}

		if (packetBySourceRef.packetId !== first.packet.packetId) {
			fail('sourceRef lookup did not resolve to the first packet.');
		}

		const second = await runPhase101SummaryCache(input, makeGenerator('second'));
		if (second.cache !== 'exact') {
			fail(`Expected second run to hit exact cache, got ${second.cache}.`);
		}

		if (second.packet.packetId !== first.packet.packetId) {
			fail('Exact cache hit did not return the same packet id.');
		}

		if (!second.packet.retrieval.exactCacheHit) {
			fail('Exact cache hit flag was not set on the second run.');
		}

		console.log('Phase 101 summary cache smoke passed.');
		console.log(
			JSON.stringify(
				{
					documentId: input.documentId,
					sourceRef,
					exactCacheKey: first.exactCacheKey,
					cacheTextPreview: cacheText.slice(0, 140),
					firstCache: first.cache,
					secondCache: second.cache,
					packetId: second.packet.packetId,
					packetSummary: second.packet.summary,
					retrieval: second.packet.retrieval,
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
	console.error('Phase 101 summary cache smoke failed:', error);
	process.exit(1);
});
