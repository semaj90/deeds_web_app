import { createClient } from 'redis';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

let redisClient: ReturnType<typeof createClient> | null = null;

export async function getRedisClient() {
 if (!redisClient) {
 redisClient = createClient({
 url: process.env?.REDIS_URL ?? 'redis://127.0.0.1:4005',
 });

 redisClient.on('error', (err) => {
 console.error('Redis Client Error:', err);
 });

 await redisClient.connect();
 }

 return redisClient;
}

export async function closeRedisClient() {
 if (redisClient) {
 await redisClient.disconnect();
 redisClient = null;
 }
}



