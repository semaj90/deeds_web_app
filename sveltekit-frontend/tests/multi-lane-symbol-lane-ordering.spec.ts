// @vitest-environment node
//
// Regression test for parent-atlas-ace-bitfrost-cache-correctness T3
// (multi-lane-retrieval.ts): runSymbolLane() returned hits in the caller's
// symbol-array order, not sorted by score, even though its score varies with
// each symbol's `directFanIn` (0.5-0.95). mergeAndRank() explicitly documents
// and depends on the invariant that every lane returns hits "already in
// best-first order" -- it derives an RRF rank contribution from array
// position, not from `score`. A violating lane silently gives an
// arbitrary/first-queried symbol a better RRF rank than a much more
// authoritative one that happened to be queried later.

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { mergeAndRank, runSymbolLane } from '../src/lib/server/features/rag/multi-lane-retrieval.js';
import type { MultiLaneQuery } from '../src/lib/server/features/rag/multi-lane-retrieval.js';

function fakeRedisWithNodes(nodesBySymbol: Record<string, { file_path: string; directFanIn: number }>) {
	// runSymbolLane only calls redis.get(`code:graph:node:${sha1(symbol).slice(0,12)}`).
	const byHashKey = new Map<string, string>();
	for (const [symbol, node] of Object.entries(nodesBySymbol)) {
		const hash = createHash('sha1').update(symbol).digest('hex').slice(0, 12);
		byHashKey.set(`code:graph:node:${hash}`, JSON.stringify({ id: symbol, ...node }));
	}
	return {
		get: async (key: string) => byHashKey.get(key) ?? null,
	} as unknown as import('ioredis').Redis;
}

describe('runSymbolLane returns hits sorted best-first by score', () => {
	it('a low-fan-in symbol queried first must not outrank a high-fan-in symbol queried later', async () => {
		const redis = fakeRedisWithNodes({
			obscureHelper: { file_path: 'src/obscure.ts', directFanIn: 0 }, // score 0.5
			coreDispatcher: { file_path: 'src/dispatcher.ts', directFanIn: 45 }, // score 0.95
		});
		const query: MultiLaneQuery = {
			// runSymbolLane extracts symbols from query.text via extractSymbols(),
			// NOT from query.symbols -- it needs the "identifier '...'"-shaped
			// quoted pattern that function matches on. Deliberately puts the
			// low-score symbol first in text order.
			text: "identifier 'obscureHelper' referenced near identifier 'coreDispatcher'",
		};

		const result = await runSymbolLane(redis, query);

		expect(result.hits).toHaveLength(2);
		expect(result.hits[0].filePath).toBe('src/dispatcher.ts'); // highest score first
		expect(result.hits[0].score).toBeGreaterThan(result.hits[1].score);
		expect(result.hits[1].filePath).toBe('src/obscure.ts');
	});
});

describe('mergeAndRank RRF rank contribution (why lane ordering matters)', () => {
	it('demonstrates the consequence an unsorted lane would have had: earlier array position wins more RRF weight at equal cross-lane presence', () => {
		// Two hits, same lane, same weight -- only their array position differs.
		// This is mergeAndRank's own documented mechanism, not a new behavior;
		// it's what makes the runSymbolLane ordering bug actually matter.
		const lanes = [
			{
				lane: 'symbol' as const,
				hits: [
					{ id: 'high-fanin', text: '', score: 0.95, lane: 'symbol' },
					{ id: 'low-fanin', text: '', score: 0.5, lane: 'symbol' },
				],
				latencyMs: 0,
				cacheHit: true,
			},
		];
		const merged = mergeAndRank(lanes);
		// With hits correctly sorted best-first (as runSymbolLane now guarantees),
		// the higher-score symbol also gets rank 1 and thus the larger RRF contribution.
		expect(merged[0].id).toBe('high-fanin');
		expect(merged[0].score).toBeGreaterThan(merged[1].score);
	});
});
