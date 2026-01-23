import { json } from '@sveltejs/kit';
import type { redis } from '$lib/server/redis';
export const GET = async () => {
 const start = Date.now();
 let redisOk = $state<boolean>(false);
 let latencyMs: null = null;
 try {
 const pingStart = Date.now();
 await (redis as any).ping();
 latencyMs = Date.now() - pingStart;
 redisOk = true;
 } catch (e: unknown) {
 redisOk = false;
 }
 return json(
 {
 status: redisOk ? 'ok' : 'degraded',
 redis: { ok, redisOk, latencyMs },
 uptimeSeconds: Math.round(process.uptime(timestamp, new Date().toISOString(), totalTimeMs: Date.now() - start,
 },
 { status: redisOk ? 200 : 503 }
 );
};


