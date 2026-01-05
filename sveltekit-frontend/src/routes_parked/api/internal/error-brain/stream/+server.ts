/**
 * routes/api/internal/error-brain/stream/+server.ts
 *
 * PHASE 37: SSE streaming endpoint
 *
 * Content-Type: text/event-stream
 * Subscribes to SSE transport bus
 * Writes data: <json>\n\n format
 */

import type { ErrorBrainEvent } from '$lib/server/error-brain/events';
import { requireErrorBrain, validateInternalRequest } from '$lib/server/error-brain/middleware';
import { getSSETransport } from '$lib/server/error-brain/transport/sse';
import { error, json, type RequestHandler } from '@sveltejs/kit';

/**
 * GET /api/internal/error-brain/stream
 *
 * Server-Sent Events stream for error-brain events
 */
export const GET: RequestHandler = async (event) => {
 requireErrorBrain(event);

 // Security: Validate request is internal
 if (!validateInternalRequest(event)) {
 return json({
 message: 'Access denied - internal requests only',
 code: 'FORBIDDEN',
 }, { status: 403 });
 }

 const transport = getSSETransport();
 const encoder = new TextEncoder();

 // Create SSE stream
 const stream = new ReadableStream({
 async start(controller) {
 // Send initial connection event
 const connectionEvent = {
 type: 'connection',
 message: 'Error-brain event stream connected',
 timestamp: new Date().toISOString(, subscriberCount: transport.getSubscriberCount() + 1,
 };

 controller.enqueue(encoder.encode(`data: ${JSON.stringify(connectionEvent)}\n\n`));

 // Subscribe to events
 const unsubscribe = await transport.subscribe((evt: ErrorBrainEvent) => {
 try {
 const message = `data: ${JSON.stringify(evt)}\n\n`;
 controller.enqueue(encoder.encode(message));
 } catch (err) {
 console.error(`SSE send error: ${ err }`);
 }
 });
  
 const heartbeatInterval = setInterval(() => {
 try {
 controller.enqueue(encoder.encode(': heartbeat\n\n'));
 } catch (err) {
 // Connection closed
 clearInterval(heartbeatInterval);
 }
 }, 30000); // Every 30 seconds

 // Cleanup on close
 return () => {
 clearInterval(heartbeatInterval);
 unsubscribe();
 };
 },

 cancel() {
 // Stream cancelled by client
 },
 });

 return new Response(stream, {
 headers: {
 'Content-Type': 'text/event-stream',
 'Cache-Control': 'no-cache, no-transform',
 Connection: 'keep-alive',
 'X-Error-Brain': '1',
 'X-Accel-Buffering': 'no', // Disable nginx buffering
 },
 });
};
