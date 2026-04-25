import { redis, ensureRedisReady } from '$lib/server/redis-client';
#!/usr/bin/env node

// Quick connectivity test for real-time system prerequisites
import { createClient } from 'redis';
import fs from 'fs';

async function quickTest() {
  console.log('🔍 Quick Real-time System Prerequisites Check\n');

  // Test Redis
  console.log('Testing Redis connection...');
  try {
    const redis = redis;
    await redis.connect();
    await redis.ping();
    console.log('✅ Redis: Connected successfully');
    await redis.quit();
  } catch (error) {
    console.log('❌ Redis: Connection failed -', error.message);
  }

  // Test if required files exist
  const requiredFiles = [
    'websocket-server.js',
    'src/lib/stores/evidenceStore.ts',
    'src/lib/utils/loki-evidence.ts',
    'src/routes/api/updates/+server.ts',
    'src/routes/api/evidence/+server.ts',
  ];

  console.log('\nChecking required files...');
  for (const file of requiredFiles) {
    if (fs.existsSync(file)) {
      console.log(`✅ ${file}: Found`);
    } else {
      console.log(`❌ ${file}: Missing`);
    }
  }

  console.log('\n🚀 Next Steps:');
  console.log('1. Start WebSocket server: npm run websocket:start');
  console.log('2. Start SvelteKit dev server: npm run dev');
  console.log('3. Visit: http://localhost:5173/evidence/realtime');
  console.log('4. Run full test: node test-realtime-system.js');
}

quickTest().catch(console.error);
