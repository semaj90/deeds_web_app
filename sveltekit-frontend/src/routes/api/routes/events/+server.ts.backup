/**
 * Server-Sent Events (SSE) Endpoint for Real-Time Route Health Updates
 *
 * GET /api/routes/events - Subscribe to health change events
 *
 * Phase 10: Real-Time Updates (SSE)
 * Task 10.1: Create SSE endpoint for health updates
 */

import type { RequestHandler } from './$types.js';

// Store active SSE connections
const connections = new Set<ReadableStreamDefaultController>();

/**
 * GET /api/routes/events
 *
 * Creates an SSE stream for real-time route health updates
 *
 * Features:
 * - Sends initial connection confirmation
 * - Heartbeat every 30 seconds to keep connection alive
 * - Auto-cleanup on client disconnect
 * - Broadcasts health changes to all connected clients
 */
export const GET: RequestHandler = async () => {
  const stream = new ReadableStream({
    start(controller) {
      // Add to active connections
      connections.add(controller);
      console.log(`[SSE] Client connected. Total connections: ${connections.size}`);

      // Send initial connection message
      try {
        controller.enqueue(
          `data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`
        );
      } catch (error) {
        console.error('[SSE] Error sending connection message:', error);
        connections.delete(controller);
        return;
      }

      // Heartbeat every 30 seconds to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(`: heartbeat\n\n`);
        } catch (error) {
          console.error('[SSE] Heartbeat failed, cleaning up connection:', error);
          clearInterval(heartbeat);
          connections.delete(controller);
        }
      }, 30000);

      // Cleanup on close
      return () => {
        clearInterval(heartbeat);
        connections.delete(controller);
        console.log(`[SSE] Client disconnected. Total connections: ${connections.size}`);
      };
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
};

/**
 * Broadcast health change to all connected clients
 *
 * Called from health event endpoint when route health changes
 *
 * @param data - Health change event data
 */
export function broadcastHealthChange(data: { routeId: string,
  oldStatus: string, newStatus: string;
  timestamp: string;
  reason?: string;
}) {
  const message = `data: ${JSON.stringify({ type: 'health_change',
    ...data,
  })}\n\n`;

  console.log(`[SSE] Broadcasting health change for route ${data.routeId}: ${data.oldStatus} → ${data.newStatus}`);

  let successCount = 0;
  let failureCount = 0;

  connections.forEach((controller) => {
    try {
      controller.enqueue(message);
      successCount++;
    } catch (error) {
      console.error('[SSE] Failed to send to client, removing connection:', error);
      connections.delete(controller);
      failureCount++;
    }
  });

  console.log(`[SSE] Broadcast complete: ${successCount} success, ${failureCount} failures`);
}

/**
 * Broadcast error count change to all connected clients
 *
 * Called when error clusters are created/resolved
 *
 * @param data - Error count change event data
 */
export function broadcastErrorCountChange(data: { routeId: string,
  errorCount: number,
  warningCount?: number;
  infoCount?: number; timestamp: string;
}) {
  const message = `data: ${JSON.stringify({ type: 'error_count_change',
    ...data,
  })}\n\n`;

  console.log(`[SSE] Broadcasting error count change for route ${data.routeId}: ${data.errorCount} errors`);

  connections.forEach((controller) => {
    try {
      controller.enqueue(message);
    } catch (error) {
      console.error('[SSE] Failed to send error count update:', error);
      connections.delete(controller);
    }
  });
}

/**
 * Get current connection count (for monitoring)
 */
export function getConnectionCount(): number {
  return connections.size;
}





