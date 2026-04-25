#!/usr/bin/env node
// Test Redis connection directly
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

console.log('Testing Redis connection directly...\n');

try {
  console.log('1. Importing ioredis...');
  const { default: Redis } = await import('ioredis');
  console.log('   ✅ ioredis imported successfully');

  console.log('\n2. Creating Redis client...');
  const redis = new Redis({
    host: '127.0.0.1',
    port: 4005,
    retryStrategy: (times) => {
      if (times > 3) return null;
      return Math.min(times * 50, 200);
    },
    enableOfflineQueue: false
  });

  console.log('   ✅ Redis client created');

  console.log('\n3. Testing PING...');
  const pong = await redis.ping();
  console.log('   ✅ PING successful:', pong);

  console.log('\n4. Testing SET/GET...');
  await redis.set('test:kag:direct', 'Hello from direct test');
  const value = await redis.get('test:kag:direct');
  console.log('   ✅ SET/GET successful:', value);

  console.log('\n5. Checking keys matching phase72:kag:*...');
  const keys = await redis.keys('phase72:kag:*');
  console.log('   Found', keys.length, 'keys');

  await redis.quit();
  console.log('\n✅ All Redis tests PASSED - Redis is working!');

} catch (error) {
  console.error('\n❌ Redis test FAILED:');
  console.error('   Error:', error.message);
  console.error('   Stack:', error.stack);
}
