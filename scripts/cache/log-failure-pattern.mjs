import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config({ path: './sveltekit-frontend/.env' });

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export async function cacheFailure(pattern) {
  await redis.lpush("atlas:failures", JSON.stringify(pattern));
  await redis.ltrim("atlas:failures", 0, 100);
}
