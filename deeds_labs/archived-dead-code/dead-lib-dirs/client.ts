import { createClient } from 'redis';
import { ENV } from '$lib/server/env.server.js';

let redisClient: ReturnType<typeof createClient> | null = null;

export async function getRedisClient() {
 if (!redisClient) {
 redisClient = createClient({
 url: ENV.REDIS_URL,
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



