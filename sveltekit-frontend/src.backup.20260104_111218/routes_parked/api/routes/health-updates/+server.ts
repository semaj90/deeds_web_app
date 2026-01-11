import type { RequestHandler } from '@sveltejs/kit';

/**
 * Phase 10.1: Health Updates Endpoint (SSE-based)
 * Endpoint: GET /api/routes/health-updates
 *
 * Purpose: Provide real-time health status updates via Server-Sent Events
 *
 * Note: SvelteKit doesn't have native WebSocket support in standard deployment.
 * This implementation uses SSE which is more compatible and works in all environments.
 */

export interface HealthUpdateMessage {
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
 * SSE endpoint handler
 * Handles Server-Sent Events connections for real-time health updates
 */
export const GET: RequestHandler = async ({ request }) => {
 const stream = new ReadableStream({
 start(controller) {
 console.log('[Phase 10.1] New SSE connection to health-updates endpoint');

 // Send connection confirmation
 const confirmationMessage: HealthUpdateMessage = {
 type: 'connection_confirmed',
 timestamp: new Date().toISOString(),
 };
 controller.enqueue(`data: ${JSON.stringify(confirmationMessage)}\n\n`);

 // Start heartbeat (ping every 30 seconds)
 const heartbeatInterval = setInterval(() => {
 try {
 const pingMessage: HealthUpdateMessage = { type: 'ping' };
 controller.enqueue(`data: ${JSON.stringify(pingMessage)}\n\n`);
 } catch (error) {
 console.error('[Phase 10.1] Error sending heartbeat:', error);
 clearInterval(heartbeatInterval);
 }
 }, 30000);

 // Handle client disconnect
 request.signal.addEventListener('abort', () => {
 clearInterval(heartbeatInterval);
 controller.close();
 console.log('[Phase 10.1] SSE connection closed');
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
