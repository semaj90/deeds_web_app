
import { getRedisHost, getRedisPort } from '$lib/config/env.server.js';
import { createRedisConnection } from '$lib/server/redis';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

// Helper: safely extract a message from unknown error values
function extractMessage(e: unknown): string {
 if (typeof e === 'string') return e;
 if (e instanceof Error) return e.message;
 if (typeof e === 'object' && e !== null) {
 const maybe = (e as Record<string, unknown>)['message'];
 if (typeof maybe === 'string') return maybe;
 }
 try {
 return String(e);
 } catch {
 return 'Unknown error';
 }
}

export const GET: RequestHandler = async () => {
 const timestamp = new Date().toISOString();
 let client: ReturnType<typeof createRedisConnection> | null = null;

 try {
 // Use a short-lived connection for health checks to avoid errors when the
 // global/shared client has been closed or is in a bad state.
 client = createRedisConnection();

 // If the client exposes connect, ensure it's open before ping
 if (client && typeof client.connect === 'function' && (client as { status?: string }).status !== 'ready') {
 await client.connect();
 }

 // Ping using the short-lived client
 if (client && typeof client.ping === 'function') {
 await client.ping();
 }

 return json({
 status: 'healthy',
 service: 'redis',
 port: getRedisPort(),
 host: getRedisHost(),
 timestamp,
 });
 } catch (error: unknown) {
 const msg = extractMessage(error);
 console.warn('[Redis Health] Redis unavailable: ', msg);

 // If the error indicates NOAUTH or AUTH problems, include a helpful hint
 if (msg.includes('NOAUTH') || msg.includes('ERR AUTH') || msg.includes('AUTH')) {
 console.warn(
 '[Redis Health] Auth mismatch, check REDIS_URL/REDIS_PASSWORD and whether Redis requires a password.'
 );
 }

 return json(
 {
 status: 'unavailable',
 service: 'redis',
 message: 'Redis not configured or unreachable',
 error: msg,
 timestamp,
 },
 { status: 503 }
 );
 } finally {
 // Quit the short-lived client if possible to avoid leaking connections
 if (client && typeof client.quit === 'function') {
 try {
 await client.quit();
 } catch {
 /* ignore quit errors */
 }
 }
 }
};


