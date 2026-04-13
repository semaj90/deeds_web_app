/**
 * Direct Redis L1 Cache Test
 * Tests redis-exact-match.ts directly
 */

async function testRedisDirect() {
	console.log('\n🧪 Testing Redis L1 Cache Directly\n');
	console.log('═'.repeat(60));

	// Dynamically import the module (use .ts extension for Node.js)
	const { generateCacheKey, setExactMatchCache, getExactMatchCache } = await import(
		'./sveltekit-frontend/src/lib/server/cache/redis-exact-match.ts'
	);

	const testMessages = [
		{ role: 'user', content: 'What is hearsay evidence?' }
	];

	// Generate cache key
	const cacheKey = generateCacheKey({
		model: 'gemma4-legal:latest',
		messages: testMessages,
		temperature: 0.7,
		maxTokens: 2048
	});

	console.log(`\n📝 Cache Key: ${cacheKey}`);

	// Test 1: Check cache miss
	console.log('\n1️⃣ Test Cache Miss (Before Storage)');
	const beforeStore = await getExactMatchCache(cacheKey);
	console.log(`   Result: ${beforeStore ? '❌ UNEXPECTED HIT' : '✅ MISS (as expected)'}`);

	// Test 2: Store in cache
	console.log('\n2️⃣ Test Cache Storage');
	await setExactMatchCache(cacheKey, {
		content: 'Hearsay is an out-of-court statement...',
		model: 'gemma4-legal:latest',
		backend: 'test'
	});
	console.log('   ✓ Storage command sent');

	// Test 3: Check cache hit
	console.log('\n3️⃣ Test Cache Hit (After Storage)');
	const afterStore = await getExactMatchCache(cacheKey);
	console.log(`   Result: ${afterStore ? '✅ HIT' : '❌ MISS (storage failed)'}`);

	if (afterStore) {
		console.log(`   Content: ${afterStore.content.slice(0, 50)}...`);
		console.log(`   Model: ${afterStore.model}`);
		console.log(`   Backend: ${afterStore.backend}`);
		console.log(`   Cached At: ${afterStore.cachedAt}`);
	}

	// Test 4: Check Redis directly
	console.log('\n4️⃣ Test Redis Keys');
	const { exec } = await import('child_process');
	exec('docker exec deeds-redis-prod redis-cli --scan --pattern "llm:exact:*"', (err, stdout) => {
		if (err) {
			console.error('   ❌ Failed to check Redis:', err);
			return;
		}
		const keys = stdout.trim().split('\n').filter(Boolean);
		console.log(`   Keys found: ${keys.length}`);
		if (keys.length > 0) {
			console.log(`   Sample: ${keys[0]}`);
			console.log('   ✅ Redis storage WORKING');
		} else {
			console.log('   ❌ No keys found - storage FAILED');
		}
	});

	console.log('\n' + '═'.repeat(60));
	console.log('✅ Direct Redis test complete');
	console.log('═'.repeat(60) + '\n');
}

testRedisDirect().catch(console.error);
