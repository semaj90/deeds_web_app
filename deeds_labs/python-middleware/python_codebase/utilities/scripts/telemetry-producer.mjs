#!/usr/bin/env node
/**
 * telemetry-producer.mjs
 * Pushes sample telemetry JSON messages into Redis list `telemetry:events` for testing.
 */
import Redis from 'redis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = Redis.createClient({ url: REDIS_URL });
redis.on('error', (e) => console.error('[redis] error', e?.message || e));

async function pushSample(count = 10, intervalMs = 200) {
  await redis.connect();
  const deviceId = process.env.DEVICE_ID || `device-${Math.floor(Math.random()*1000)}`;
  for (let i = 0; i < count; i++) {
    const msg = {
      ts: Date.now(),
      graphId: 'demo',
      deviceId,
      fps: 60 - Math.round(Math.random() * 10),
      frameTime: Math.round(16 + Math.random() * 8),
      gpuMemoryUsage: Math.round(50 + Math.random() * 200),
      nodeCount: Math.round(100 + Math.random() * 400),
      edgeCount: Math.round(200 + Math.random() * 1000),
    };
    await redis.lPush('telemetry:events', JSON.stringify(msg));
    console.log('[producer] pushed sample', i + 1);
    await new Promise(r => setTimeout(r, intervalMs));
  }
  await redis.disconnect();
  console.log('[producer] done');
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('telemetry-producer.mjs')) {
  pushSample().catch(e => { console.error('[producer] error', e?.message || e); process.exit(1); });
}

export { pushSample };
