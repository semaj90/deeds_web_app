/**
 * Test SSE Chat Cache Integration
 * Tests the Redis L1 exact-match cache in the SSE chat endpoint
 */

async function testSSECache() {
	const query = 'What is hearsay evidence?';

	console.log('\n🧪 Testing SSE Chat Cache Integration\n');
	console.log('═'.repeat(60));

	// Test 1: Cold query (first time)
	console.log('\n📝 Test 1: Cold Query (First Time)');
	console.log(`Query: "${query}"`);
	console.log('Expected: ~2-3s (Ollama GPU)');

	const start1 = Date.now();
	const response1 = await fetch('http://localhost:5173/api/sse/chat', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			message: query,
			conversationId: 'test-cache-' + Date.now()
		})
	});

	if (!response1.ok) {
		console.error('❌ Failed:', response1.status, response1.statusText);
		return;
	}

	// Consume SSE stream
	const reader = response1.body.getReader();
	const decoder = new TextDecoder();
	let fullResponse = '';

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		const text = decoder.decode(value);
		const lines = text.split('\n').filter(line => line.startsWith('data:'));

		for (const line of lines) {
			try {
				const data = JSON.parse(line.slice(6));
				if (data.content) {
					fullResponse = data.content;
				}
			} catch {}
		}
	}

	const latency1 = Date.now() - start1;
	console.log(`✓ Response: ${fullResponse.slice(0, 100)}...`);
	console.log(`✓ Latency: ${latency1}ms`);
	console.log(`✓ Status: ${latency1 > 1000 ? 'COLD (Ollama)' : 'CACHED'}`);

	// Wait 2 seconds for cache to settle
	console.log('\n⏳ Waiting 2 seconds for cache storage...');
	await new Promise(resolve => setTimeout(resolve, 2000));

	// Test 2: Warm query (exact same, should hit cache)
	console.log('\n📝 Test 2: Warm Query (Cached)');
	console.log(`Query: "${query}" (exact same)`);
	console.log('Expected: <100ms (Redis L1 cache)');

	const start2 = Date.now();
	const response2 = await fetch('http://localhost:5173/api/sse/chat', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			message: query,
			conversationId: 'test-cache-' + Date.now()
		})
	});

	if (!response2.ok) {
		console.error('❌ Failed:', response2.status, response2.statusText);
		return;
	}

	const reader2 = response2.body.getReader();
	let fullResponse2 = '';

	while (true) {
		const { done, value } = await reader2.read();
		if (done) break;

		const text = decoder.decode(value);
		const lines = text.split('\n').filter(line => line.startsWith('data:'));

		for (const line of lines) {
			try {
				const data = JSON.parse(line.slice(6));
				if (data.content) {
					fullResponse2 = data.content;
				}
			} catch {}
		}
	}

	const latency2 = Date.now() - start2;
	console.log(`✓ Response: ${fullResponse2.slice(0, 100)}...`);
	console.log(`✓ Latency: ${latency2}ms`);
	console.log(`✓ Status: ${latency2 < 1000 ? '✨ CACHED' : 'COLD (cache miss)'}`);

	// Calculate speedup
	const speedup = latency1 / latency2;
	console.log('\n═'.repeat(60));
	console.log('📊 Results:');
	console.log(`  Cold Query:   ${latency1}ms`);
	console.log(`  Cached Query: ${latency2}ms`);
	console.log(`  Speedup:      ${speedup.toFixed(1)}× faster`);
	console.log(`  Cache Status: ${latency2 < 1000 ? '✅ WORKING' : '❌ NOT WORKING'}`);
	console.log('═'.repeat(60) + '\n');

	// Check Redis keys
	console.log('🔍 Checking Redis cache keys...');
	const { exec } = await import('child_process');
	exec('docker exec deeds-redis-prod redis-cli --scan --pattern "llm:exact:*" | wc -l', (err, stdout) => {
		if (err) {
			console.error('❌ Failed to check Redis:', err);
			return;
		}
		const keyCount = parseInt(stdout.trim());
		console.log(`✓ Redis L1 cache keys: ${keyCount}`);
		console.log(keyCount > 0 ? '✅ Cache keys present' : '⚠️  No cache keys found');
	});
}

testSSECache().catch(console.error);
