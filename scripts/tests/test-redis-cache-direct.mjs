#!/usr/bin/env node

/**
 * Direct test of Redis exact-match cache (no HTTP, no HMR issues)
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Directly test the cache functions
async function test() {
  console.log('Testing Redis exact-match cache directly...\n');

  // Dynamic import the cache module
  const { generateCacheKey, getExactMatchCache, setExactMatchCache } = await import(
    '../../sveltekit-frontend/src/lib/server/cache/redis-exact-match.js'
  );

  const testMessages = [
    { role: 'user', content: 'What is hearsay evidence?' }
  ];

  const cacheKey = generateCacheKey({
    model: 'gemma4-rotorquant:latest-fast',
    messages: testMessages,
    temperature: 0.3,
    maxTokens: 200,
  });

  console.log(`Cache key: ${cacheKey.slice(0, 16)}...`);

  // Test 1: Should be a miss
  console.log('\n1. Check cache (should be miss)...');
  const miss = await getExactMatchCache(cacheKey);
  console.log(miss ? '❌ Unexpected hit' : '✓ Cache miss (expected)');

  // Test 2: Store a response
  console.log('\n2. Store response in cache...');
  await setExactMatchCache(cacheKey, {
    content: 'Test response content',
    model: 'gemma4-rotorquant:latest-fast',
    backend: 'ollama-direct',
  });
  console.log('✓ Stored');

  // Test 3: Should be a hit
  console.log('\n3. Check cache (should be hit)...');
  const hit = await getExactMatchCache(cacheKey);
  if (hit) {
    console.log('✓ Cache HIT!');
    console.log(`  Content: ${hit.content}`);
    console.log(`  Model: ${hit.model}`);
    console.log(`  Backend: ${hit.backend}`);
    console.log(`  Cached at: ${hit.cachedAt}`);
  } else {
    console.log('❌ Cache MISS (unexpected!)');
  }

  // Test 4: Verify same key generation
  console.log('\n4. Verify cache key consistency...');
  const cacheKey2 = generateCacheKey({
    model: 'gemma4-rotorquant:latest-fast',
    messages: testMessages,
    temperature: 0.3,
    maxTokens: 200,
  });
  console.log(cacheKey === cacheKey2 ? '✓ Keys match' : '❌ Keys differ!');

  console.log('\n✅ Test complete');
  process.exit(0);
}

test().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
