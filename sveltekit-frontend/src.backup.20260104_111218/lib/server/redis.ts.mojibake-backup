// eslint-disable-next-line @typescript-eslint/no-require-imports
const IORedis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

// Single shared client for SSR
export const redis = new IORedis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 2,
  enableReadyCheck: true,
});

export async function ensureRedis() {
  if (redis.status === 'ready') return;
  if (redis.status === 'connecting') {
    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      redis.once('ready', resolve);
      redis.once('error', reject);
    });
    return;
  }
  await redis.connect();
}
