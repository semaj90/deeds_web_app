/**
 * Simple Bifrost Test - Quick cache verification
 */

const BIFROST_URL = 'http://127.0.0.1:3040';

async function testBifrost() {
	const query = 'What is negligence? Answer in 10 words.';

	console.log('Testing Bifrost with query:', query);
	console.log();

	// First call (cold)
	console.log('1. Cold query (no cache)...');
	const start1 = Date.now();
	const res1 = await fetch(`${BIFROST_URL}/v1/chat/completions`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: 'ollama-local/gemma4-legal:latest',
			messages: [{ role: 'user', content: query }],
			temperature: 0.7,
			max_tokens: 50,
			stream: false,
		}),
	});
	const latency1 = Date.now() - start1;
	const data1 = await res1.json();
	const content1 = data1.choices?.[0]?.message?.content ?? 'NO RESPONSE';

	console.log(`   Latency: ${latency1}ms`);
	console.log(`   Response: ${content1}`);
	console.log();

	// Wait 1s
	await new Promise(r => setTimeout(r, 1000));

	// Second call (hot - should hit cache)
	console.log('2. Hot query (cache hit)...');
	const start2 = Date.now();
	const res2 = await fetch(`${BIFROST_URL}/v1/chat/completions`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: 'ollama-local/gemma4-legal:latest',
			messages: [{ role: 'user', content: query }],
			temperature: 0.7,
			max_tokens: 50,
			stream: false,
		}),
	});
	const latency2 = Date.now() - start2;
	const data2 = await res2.json();
	const content2 = data2.choices?.[0]?.message?.content ?? 'NO RESPONSE';

	console.log(`   Latency: ${latency2}ms`);
	console.log(`   Response: ${content2}`);
	console.log();

	// Results
	const speedup = (latency1 / latency2).toFixed(1);
	const cacheHit = latency2 < 200;

	console.log('═'.repeat(60));
	console.log('RESULTS');
	console.log('═'.repeat(60));
	console.log(`Cold: ${latency1}ms`);
	console.log(`Hot:  ${latency2}ms (${speedup}x speedup)`);
	console.log(`Cache hit: ${cacheHit ? 'YES ✅' : 'NO ❌'}`);
	console.log();

	if (cacheHit && speedup >= 5) {
		console.log('✅ Bifrost semantic cache WORKING — significant speedup achieved');
	} else if (cacheHit) {
		console.log('⚠️  Bifrost cache hit but speedup below expected');
	} else {
		console.log('❌ Bifrost cache NOT working');
	}
}

testBifrost().catch(console.error);
