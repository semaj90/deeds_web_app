#!/usr/bin/env node
import Redis from 'ioredis';

const client = new Redis({ host: '127.0.0.1', port: 4005 });

try {
  const keys = await client.keys('phase72:kag:*');
  console.log(`\n✅ Found ${keys.length} KAG keys in Redis\n`);

  if (keys.length > 0) {
    console.log('Sample keys:');
    keys.slice(0, 10).forEach(k => console.log(`  - ${k}`));

    // Check stats key
    if (keys.includes('phase72:kag:stats')) {
      const stats = await client.get('phase72:kag:stats');
      console.log('\n📊 Stats:');
      console.log(JSON.parse(stats));
    }
  }

  await client.quit();
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
