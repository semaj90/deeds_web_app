import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

async function main() {
  console.log('Clearing Redis cache...');
  await redis.flushdb();
  console.log('Redis cache cleared.');
  process.exit(0);
}

main().catch(console.error);