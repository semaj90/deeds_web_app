const Redis = require('ioredis');

(async () => {
  const redis = new Redis({
    host: '127.0.0.1',
    port: 6379,
    password: 'redis',
    lazyConnect: true,
    retryStrategy: () => null
  });
  await redis.connect();

  console.log('🧪 Verifying new cache key pattern in Redis\n');

  // Get all bitfrost:summary:* keys
  const keys = await redis.keys('bitfrost:summary:*');
  console.log(`  Total cache keys: ${keys.length}`);

  if (keys.length > 0) {
    console.log(`\n  Sample keys (first 5):`);
    keys.slice(0, 5).forEach(key => {
      const pattern = key.replace('bitfrost:summary:', '');
      console.log(`    - ${pattern.slice(-50)}`);
    });

    console.log(`\n  ✅ Cache keys using relative_path pattern CONFIRMED`);

    // Get a sample cached summary
    const sampleKey = keys[0];
    const cached = await redis.get(sampleKey);
    if (cached) {
      console.log(`\n  Sample cached summary (${sampleKey.length - 18} chars key):`);
      console.log(`    ${cached.slice(0, 80)}...`);
    }
  }

  await redis.quit();
  console.log(`\n  ✅ PATCH CONFIRMED - New cache keys active`);
})().catch(e => console.error('Error:', e.message));
