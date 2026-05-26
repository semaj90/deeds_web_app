/**
 * Bifrost Semantic Cache Test
 *
 * Tests the semantic caching capability of Bifrost gateway by:
 * 1. Making a legal query (cold - no cache)
 * 2. Repeating the exact same query (hot - should hit cache)
 * 3. Making a semantically similar query (warm - might hit cache)
 *
 * Target: 28x speedup on cache hits (cache hit <200ms, cold query ~5-6s)
 */

const BIFROST_URL = 'http://127.0.0.1:3040';
const TEST_MODEL = 'ollama-local/gemma4-rotorquant:latest';

const queries = {
	cold: 'List the four elements of negligence under tort law.',
	hot: 'List the four elements of negligence under tort law.', // Exact duplicate
	warm: 'What are the 4 elements required to prove negligence?', // Semantically similar
};

async function testBifrostCache() {
	console.log('═'.repeat(80));
	console.log('Bifrost Semantic Cache Test — Legal Query Benchmark');
	console.log('═'.repeat(80));
	console.log();

	const results = [];

	for (const [type, query] of Object.entries(queries)) {
		const start = Date.now();

		try {
			const res = await fetch(`${BIFROST_URL}/v1/chat/completions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: TEST_MODEL,
					messages: [{ role: 'user', content: query }],
					temperature: 0.7,
					max_tokens: 512,
					stream: false,
				}),
				signal: AbortSignal.timeout(120000),
			});

			const latency = Date.now() - start;

			if (!res.ok) {
				const text = await res.text().catch(() => '');
				console.error(`❌ ${type.toUpperCase()} query FAILED (${res.status}): ${text.slice(0, 200)}`);
				results.push({ type, latency, status: 'error', cacheHit: false });
				continue;
			}

			const data = await res.json();
			const content = data.choices?.[0]?.message?.content ?? '';
			const cacheHit = latency < 200; // Cache hits should be <200ms
			const speedup = type === 'cold' ? '1x (baseline)' : `${(results[0].latency / latency).toFixed(1)}x`;

			console.log(`${cacheHit ? '⚡' : '🔄'} ${type.toUpperCase()} query (${latency}ms) — ${cacheHit ? 'CACHE HIT' : 'CACHE MISS'} — Speedup: ${speedup}`);
			console.log(`   Query: "${query.slice(0, 60)}..."`);
			console.log(`   Response: "${content.slice(0, 100)}..."`);
			console.log();

			results.push({ type, latency, status: 'ok', cacheHit, speedup, content: content.slice(0, 200) });
		} catch (err) {
			const latency = Date.now() - start;
			console.error(`❌ ${type.toUpperCase()} query ERROR (${latency}ms):`, err.message);
			results.push({ type, latency, status: 'error', cacheHit: false, error: err.message });
		}

		// Small delay between queries to ensure Bifrost processes the cache
		if (type !== 'warm') {
			await new Promise(resolve => setTimeout(resolve, 500));
		}
	}

	console.log('═'.repeat(80));
	console.log('Summary');
	console.log('═'.repeat(80));

	const coldLatency = results.find(r => r.type === 'cold')?.latency ?? 0;
	const hotLatency = results.find(r => r.type === 'hot')?.latency ?? 0;
	const warmLatency = results.find(r => r.type === 'warm')?.latency ?? 0;

	const hotSpeedup = coldLatency > 0 ? (coldLatency / hotLatency).toFixed(1) : 'N/A';
	const warmSpeedup = coldLatency > 0 ? (coldLatency / warmLatency).toFixed(1) : 'N/A';

	console.log(`Cold (no cache):       ${coldLatency}ms`);
	console.log(`Hot (exact match):     ${hotLatency}ms — ${hotSpeedup}x speedup ${hotSpeedup >= 28 ? '✅ TARGET MET' : '⚠️ below 28x target'}`);
	console.log(`Warm (semantic match): ${warmLatency}ms — ${warmSpeedup}x speedup`);
	console.log();

	if (hotLatency < 200 && hotSpeedup >= 5) {
		console.log('✅ Bifrost semantic cache is OPERATIONAL and providing significant speedup');
	} else if (hotLatency < 200) {
		console.log('✅ Bifrost cache is working but speedup is lower than expected');
	} else {
		console.log('❌ Bifrost cache NOT working — hot query should be <200ms');
	}

	console.log();
	console.log('Full Results:');
	console.table(results.map(r => ({
		Type: r.type.toUpperCase(),
		Latency: `${r.latency}ms`,
		Status: r.status.toUpperCase(),
		'Cache Hit': r.cacheHit ? 'YES' : 'NO',
		Speedup: r.speedup ?? 'N/A',
	})));
}

testBifrostCache().catch(err => {
	console.error('FATAL ERROR:', err);
	process.exit(1);
});
