import type { RequestHandler } from '@sveltejs/kit';

/**
 * Phase 10.2: SSE Fallback Endpoint
 * Endpoint: GET /api/routes/health-updates-sse
 *
 * Purpose: Provide Server-Sent Events fallback for WebSocket-restricted environments
 *
 * Message Format: *, data: {"type":"health_update","route_path":"...","new_status":"..."}
 */

// Global set to track all connected SSE clients
const connectedSSEClients = new Set<ReadableStreamDefaultController>();

// Message format for health updates (same as WebSocket)
interface HealthUpdateMessage {
 type: 'health_update' | 'connection_confirmed' | 'initial_state' | 'ping';
 route_path?: string;
 old_status?: 'healthy' | 'flaky' | 'broken';
 new_status?: 'healthy' | 'flaky' | 'broken';
 error_count?: number;
 warning_count?: number;
 timestamp?: string;
 last_error_message?: string;
}

/**
 * 2.1: Broadcast health updates to all SSE clients
 * Send same message format as WebSocket
 */
function broadcastHealthUpdateSSE(message: HealthUpdateMessage): void {
 const messageStr = JSON.stringify(message);
 let successCount = 0;
 let failureCount = 0;

 connectedSSEClients.forEach((controller) => {
 try {
 controller.enqueue(`data: ${messageStr}\n\n`);
 successCount++;
 } catch (error) {
 console.error('[Phase 10.2] Error broadcasting to SSE client:', error);
 failureCount++;
 connectedSSEClients.delete(controller);
 }
 });

 console.log(
 `[Phase 10.2] SSE Broadcast complete: ${successCount} success, ${failureCount} failures, ${connectedSSEClients.size} total clients`
 );
}

/**
 * SSE endpoint handler
 * Handles Server-Sent Events connections
 */
export const GET: RequestHandler = async ({ request }) => {
 // Create a ReadableStream for SSE
 const stream = new ReadableStream({
 start(controller) {
 // Add controller to connected clients
 connectedSSEClients.add(controller);
 console.log(`[Phase 10.2] New SSE connection. Total clients: ${connectedSSEClients.size}`);

 // Send connection confirmation
 const confirmationMessage: HealthUpdateMessage = {
 type: 'connection_confirmed',
 timestamp: new Date().toISOString(),
 };
 controller.enqueue(`data: ${JSON.stringify(confirmationMessage)}\n\n`);

 // Start heartbeat for this connection (ping every 30 seconds)
 const heartbeatInterval = setInterval(() => {
 try {
 const pingMessage: HealthUpdateMessage = { type: 'ping' };
 controller.enqueue(`data: ${JSON.stringify(pingMessage)}\n\n`);
 } catch (error) {
 console.error('[Phase 10.2] Error sending heartbeat:', error);
 clearInterval(heartbeatInterval);
 connectedSSEClients.delete(controller);
 }
 }, 30000); // 30 seconds

 // Handle client disconnect
 request.signal.addEventListener('abort', () => {
 clearInterval(heartbeatInterval);
 connectedSSEClients.delete(controller);
 controller.close();
 console.log(
 `[Phase 10.2] SSE connection closed. Total clients: ${connectedSSEClients.size}`
 );
 });
 },
 });

 return new Response(stream, {
 headers: {
 'Content-Type': 'text/event-stream',
 'Cache-Control': 'no-cache',
 Connection: 'keep-alive',
 'Access-Control-Allow-Origin': '*',
 },
 });
};

// Note: connectedSSEClients is used internally for broadcasting
// It's not exported as SvelteKit only allows specific exports
