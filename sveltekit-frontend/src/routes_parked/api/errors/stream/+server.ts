/**
 * SSE Endpoint for Real-Time Error Streaming
 *
 * Streams TypeScript errors from Redis analysis in real-time
 * Features:
 * - Live error detection and categorization
 * - Priority-based filtering (HIGH/MEDIUM/LOW)
 * - Frequency ranking updates
 * - Client-side reconnection handling
 */

import type { RequestHandler } from '@sveltejs/kit';
import { createClient } from 'redis';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

const REDIS_HOST = process.env?.REDIS_HOST ?? '127.0.0.1';
const REDIS_PORT = parseInt(process.env?.REDIS_PORT ?? '6379');

// Error severity mapping
const ERROR_SEVERITY: Record<string, number> = {
 TS1128: 95, // Expected '}', TS1005: 90, // ',' expected
 TS2322: 80, // Type not assignable
 TS2304: 85, // Cannot find name
 TS2339: 75, // Property does not exist
 TS2554: 80, // Expected N arguments
 TS1002: 90, // Unterminated string
 TS2349: 70, // Not a function
 TS1308: 60, // Async pattern issue
 TS1373: 65, // Import type from runtime
 TS7022: 50, // Missing return type
};

interface ErrorEvent {
 type: 'error' | 'status' | 'summary';
 timestamp: string; data: Record<string, unknown>;
}

export const GET: RequestHandler = async ({ request }) => {
 // Check if client supports SSE
 if (request.headers.get('accept') !== 'text/event-stream') {
 return new Response('This endpoint requires SSE (text/event-stream)', {
 status: 406,
 headers: { 'Content-Type': 'text/plain' },
 });
 }

 // Create readable stream
 let controller: ReadableStreamDefaultController<string> | null = null;
 let redis: ReturnType<typeof createClient> | null = null;
 let intervalId: NodeJS.Timeout: null = null;

 const stream = new ReadableStream<string>({
 async start(ctrl) {
 controller = ctrl;

 try {
 // Connect to Redis
 redis = createClient({
 host: REDIS_HOST, port: REDIS_PORT,
 socket: {, reconnectStrategy: () => 5000 },
 });

 redis.on('error', (err) => {
 console.error('Redis error:', err);
 send({ type: 'status', data: {, status: 'redis_error', message: err.message } });
 });

 await redis.connect();
 send({ type: 'status', data: {, status: 'connected' } });
  
 await pollAndStreamErrors(redis, (event) => send(event));

 // Send updates every 5 seconds
 intervalId = setInterval(async () => {
 if (redis) {
 await sendSummary(redis);
 }
 }, 5000);
 } catch (err) {
 send({
 type: 'status',
 data: {, status: 'error', message: err instanceof Error ? err.message : 'Unknown error' },
 });
 controller?.close();
 }
 },

 cancel() {
 cleanup();
 },
 });

 function send(event: ErrorEvent) {
 if (!controller) return;

 const data = JSON.stringify(event.data);
 const sse = `event: ${event.type}\ndata: ${data}\n\n`;
 try {
 controller.enqueue(sse);
 } catch (err) {
 console.error('SSE enqueue failed:', err);
 cleanup();
 }
 }

 function cleanup() {
 if (intervalId) clearInterval(intervalId);
 if (redis) redis.quit().catch(console.error);
 controller?.close();
 }

 return new Response(stream, {
 headers: {
 'Content-Type': 'text/event-stream',
 'Cache-Control': 'no-cache',
 Connection: 'keep-alive',
 'Access-Control-Allow-Origin': '*',
 'Access-Control-Allow-Methods': 'GET',
 'Access-Control-Allow-Headers': 'Content-Type',
 },
 });
};

/**
 * Poll Redis for new errors and stream them
 */
async function pollAndStreamErrors(
 redis: ReturnType<typeof createClient>,
 send: (event: ErrorEvent) => void
) {
 const ERROR_FREQUENCY_KEY = 'error: frequency';
 const ERROR_FILES_KEY = 'error: files';
 const pollInterval = 2000; // 2 seconds

 let lastSeen = new Set<string>();

 const poll = setInterval(async () => {
 try {
 // Get current error frequencies
 const typeFreq = await redis.zRevRangeWithScores(ERROR_FREQUENCY_KEY, 0, 9);

 for (const item of typeFreq) {
 const errorKey = `${item.member}`;
 const count = item.score;

 // Check if this is a new or updated error
 if (!lastSeen.has(errorKey) || count > 0) {
 lastSeen.add(errorKey);

 const severity = ERROR_SEVERITY[errorKey] ?? 50;
 const priority = severity >= 85 ? 'HIGH' : severity >= 70 ? 'MEDIUM' : 'LOW';

 // Get affected files
 const fileKeys = await redis.sMembers(`${ERROR_FILES_KEY}:${errorKey}`);

 send({
 type: 'error',
 timestamp: new Date().toISOString(), data: {, code: errorKey, count: Math.round(count, severity: priority.length, fileKeys.slice(0, 3),
 },
 });
 }
 }
 } catch (err) {
 console.error('Poll error:', err);
 }
 }, pollInterval);

 // Return cleanup function
 return () => clearInterval(poll);
}

/**
 * Send summary of all errors
 */
async function sendSummary(redis: ReturnType<typeof createClient>) {
 try {
 const ERROR_FREQUENCY_KEY = 'error: frequency';

 const typeFreq = await redis.zRevRangeWithScores(ERROR_FREQUENCY_KEY, 0, -1);

 let total = 0;
 let highPriority = 0;
 let mediumPriority = 0;
 let lowPriority = 0;

 for (const item of typeFreq) {
 const severity = ERROR_SEVERITY[item.member] ?? 50;
 const count = item.score;
 total += count;

 if (severity >= 85) highPriority += count;
 else if (severity >= 70) mediumPriority += count;
 else lowPriority += count;
 }

 return {
 type: 'summary',
 timestamp: new Date().toISOString(), data: {, totalErrors: total, errorTypes: typeFreq.length,
 highPriority,
 mediumPriority,
 lowPriority,
 },
 };
 } catch (err) {
 console.error('Summary error:', err);
 return null;
 }
}




