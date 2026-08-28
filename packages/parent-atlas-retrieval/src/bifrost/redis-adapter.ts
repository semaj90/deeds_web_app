import { Redis } from 'ioredis';

let client: Redis | null = null;

/** Package-local Valkey adapter; cache state is disposable and non-canonical. */
export function getBifrostRedis(): Redis {
  if (client) return client;
  const url = process.env.REDIS_URL ?? process.env.VALKEY_URL ?? 'redis://127.0.0.1:6379';
  client = new Redis(url, {
    password: process.env.REDIS_PASSWORD ?? process.env.REDIS_PASS,
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    lazyConnect: true,
    connectTimeout: 3000,
    commandTimeout: 3000,
  });
  return client;
}
