/**
 * Bifrost Semantic Cache Test with gemma3:270m (fits in available VRAM)
 */

const BIFROST_URL = 'http://127.0.0.1:3040';
const MODEL = 'ollama-local/gemma3:270m';  // Small model that works

async function testCache() {
	const query = 'What is negligence?';

	console.log('═'.repeat(70));
	console.log('Bifrost Semantic Cache Test — gemma3:270m');
	console.log('═'.repeat(70));
	console.log();

	// Cold query
	console.log('1️⃣  COLD query (no cache)...');
	const start1 = Date.now();
	const res1 = await fetch(`${BIFROST_URL}/v1/chat/completions`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: MODEL,
			messages: [{ role: 'user', content: query }],
			temperature: 0.7,
			max_tokens: 100,
			stream: false,
		}),
	});
	const latency1 = Date.now() - start1;
	const data1 = await res1.json();
	const content1 = data1.choices?.[0]?.message?.content || data1.error?.message || 'NO RESPONSE';

	console.log(`   Latency: ${latency1}ms`);
	console.log(`   Response: ${content1.slice(0, 80)}...`);
	console.log();

	// Wait 2s
	await new Promise(r => setTimeout(r, 2000));

	// Hot query (same)
	console.log('2️⃣  HOT query (exact match, should hit cache)...');
	const start2 = Date.now();
	const res2 = await fetch(`${BIFROST_URL}/v1/chat/completions`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: MODEL,
			messages: [{ role: 'user', content: query }],
			temperature: 0.7,
			max_tokens: 100,
			stream: false,
		}),
	});
	const latency2 = Date.now() - start2;
	const data2 = await res2.json();
	const content2 = data2.choices?.[0]?.message?.content || data2.error?.message || 'NO RESPONSE';

	console.log(`   Latency: ${latency2}ms`);
	console.log(`   Response: ${content2.slice(0, 80)}...`);
	console.log();

	// Wait 2s
	await new Promise(r => setTimeout(r, 2000));

	// Warm query (similar)
	console.log('3️⃣  WARM query (semantic similarity)...');
	const start3 = Date.now();
	const res3 = await fetch(`${BIFROST_URL}/v1/chat/completions`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: MODEL,
			messages: [{ role: 'user', content: 'Define negligence in law' }],
			temperature: 0.7,
			max_tokens: 100,
			stream: false,
		}),
	});
	const latency3 = Date.now() - start3;
	const data3 = await res3.json();
	const content3 = data3.choices?.[0]?.message?.content || data3.error?.message || 'NO RESPONSE';

	console.log(`   Latency: ${latency3}ms`);
	console.log(`   Response: ${content3.slice(0, 80)}...`);
	console.log();

	// Results
	const speedup2 = (latency1 / latency2).toFixed(1);
	const speedup3 = (latency1 / latency3).toFixed(1);
	const cacheHit2 = latency2 < 200;
	const cacheHit3 = latency3 < 200;

	console.log('═'.repeat(70));
	console.log('RESULTS');
	console.log('═'.repeat(70));
	console.log(`Cold (no cache):       ${latency1}ms`);
	console.log(`Hot (exact):           ${latency2}ms — ${speedup2}x speedup ${cacheHit2 ? '✅ CACHE HIT' : '❌ cache miss'}`);
	console.log(`Warm (semantic):       ${latency3}ms — ${speedup3}x speedup ${cacheHit3 ? '✅ CACHE HIT' : cacheHit3 ? '⚡ maybe cached' : '❌ cache miss'}`);
	console.log();

	if (cacheHit2 && speedup2 >= 5) {
		console.log('🎉 Bifrost semantic cache WORKING — significant speedup achieved!');
	} else if (cacheHit2) {
		console.log('✅ Cache hits are fast but speedup is lower than expected');
		console.log('   (This is normal for smaller models with fast inference)');
	} else {
		console.log('❌ Bifrost cache NOT working — hot query should be <200ms');
	}
}

testCache().catch(console.error);
