

import { createRedisConnection } from '$lib/server/redis';
import { attachDispose } from '$lib/server/redis-disposable.js';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { ENV } from '$lib/server/env.server.js';

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

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ status: 'unavailable', error: 'Unauthorized' }, { status: 401 });
 const timestamp = new Date().toISOString();

 try {
   // Use a short-lived connection for health checks. D16: `await using` +
   // attachDispose auto-closes the client on scope exit (success or throw),
   // replacing the previous `let client = null; ... finally { if (client) client.quit() }`
   // pattern. The dispose hook swallows quit errors so already-closed
   // clients don't double-throw.
   await using client = attachDispose(createRedisConnection());

   // Ping using the short-lived client
   if (client && typeof client.ping === 'function') {
     if (
       typeof client.connect === 'function' &&
       (client as { status?: string }).status === 'wait'
     ) {
       await client.connect();
     }
     await client.ping();
   }

   return json({
     status: 'healthy',
     service: 'redis',
     port: ENV.REDIS_PORT,
     host: ENV.REDIS_HOST,
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
     timestamp,
   },
   { status: 503 }
 );
 }
 // No finally — `await using client` auto-disposes on scope exit (even on throw)
};

