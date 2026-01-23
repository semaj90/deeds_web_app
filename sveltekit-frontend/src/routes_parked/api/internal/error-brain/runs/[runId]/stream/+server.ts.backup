/**
 * routes/api/internal/error-brain/runs/[runId]/stream/+server.ts
 *
 * PHASE 27: Real-time progress streaming via Server-Sent Events (SSE)
 *
 * GET /api/internal/error-brain/runs/:runId/stream
 *
 * Streams progress events for a running diff application.
 * Events: progress, patch-applied, validation-complete, error, done
 */

import { requireErrorBrain } from '$lib/server/error-brain/middleware';
import type { RequestHandler } from '@sveltejs/kit';

// In-memory store of active runners (in production, use Redis)
const activeRunners = new Map<string, any>();

export const GET: RequestHandler = async (event) => {
 requireErrorBrain(event);

 const { runId } = event.params;
 const runner = activeRunners.get(runId);

 if (!runner) {
 return new Response('Run not found', { status: 404 });
 }

 const tracker = runner.getTracker();

 // Create SSE stream
 const stream = new ReadableStream({
 start(controller) {
 const encoder = new TextEncoder();

 // Send initial progress
 const initialData = JSON.stringify(tracker.getProgress());
 controller.enqueue(encoder.encode(`data: ${initialData}\n\n`));

 // Subscribe to progress events
 const unsubscribe = tracker.subscribe((progressEvent) => {
 const eventData = JSON.stringify({
 type: progressEvent.type,
 timestamp: progressEvent.timestamp,
 data: progressEvent.data,
 });

 controller.enqueue(encoder.encode(`event: ${progressEvent.type}\ndata: ${eventData}\n\n`));

 // Close stream on completion
 if (progressEvent.type === 'done' || progressEvent.type === 'error') {
 setTimeout(() => {
 unsubscribe();
 controller.close();
 }, 1000);
 }
 });
  
 event.request.signal.addEventListener('abort', () => {
 unsubscribe();
 controller.close();
 });
 },
 });

 return new Response(stream, {
 headers: {
 'Content-Type': 'text/event-stream',
 'Cache-Control': 'no-cache',
 Connection: 'keep-alive',
 },
 });
};

/**
 * Register a runner for SSE streaming
 */
export function registerRunner(runId: string): void {
 activeRunners.set(runId, runner);
}

/**
 * Unregister a runner
 */
export function unregisterRunner(runId: string): void {
 activeRunners.delete(runId);
}
