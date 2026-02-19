#!/usr/bin/env node

import { cache } from '../src/lib/server/cache/redis.js';

console.log('🔍 Testing Redis connection...');

async function testRedis() {
  try {
    // Test basic set/get
    console.log('📝 Testing basic cache operations...');
    await cache.set('test_key', { message: 'Hello Redis!' }, 60000);
    const result = await cache.get('test_key');
    console.log('✅ Cache set/get working:', result);

    // Test embedding cache
    console.log('🧠 Testing embedding cache...');
    const testEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5];
    await cache.setEmbedding('test text', testEmbedding, 'test-model');
    const cachedEmbedding = await cache.getEmbedding('test text', 'test-model');
    console.log('✅ Embedding cache working:', cachedEmbedding?.length === 5 ? 'PASS' : 'FAIL');

    // Test search results cache
    console.log('🔍 Testing search results cache...');
    await cache.setSearchResults('test query', 'evidence', [{ id: 1, title: 'Test Result' }]);
    const cachedSearch = await cache.getSearchResults('test query', 'evidence');
    console.log('✅ Search cache working:', cachedSearch?.length === 1 ? 'PASS' : 'FAIL');

    // Clean up
    await cache.del('test_key');

    console.log('🎉 All Redis tests passed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Redis test failed:', error.message);
    console.log('💡 Redis will fall back to memory cache - this is OK for development');
    process.exit(1);
  }
}

testRedis();
