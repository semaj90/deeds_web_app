import { json } from '@sveltejs/kit';
/**
 * Server-Sent Events (SSE) Endpoint for Real-Time Route Health Updates
 *
 * GET /api/routes/events - Subscribe to health change events
 *
 * Phase 10: Real-Time Updates (SSE)
 * Task 10.1: Create SSE endpoint for health updates
 */

import type { RequestHandler } from './$types.js';

// Store active SSE connections with last-active timestamps for zombie detection
const MAX_SSE_CONNECTIONS = 500;
const ZOMBIE_TIMEOUT_MS = 120_000; // 2 minutes without heartbeat = zombie
const connections = new Map<ReadableStreamDefaultController, number>();

// Periodic zombie cleanup every 60s
setInterval(() => {
  const now = Date.now();
  for (const [ctrl, lastActive] of connections) {
    if (now - lastActive > ZOMBIE_TIMEOUT_MS) {
      connections.delete(ctrl);
      try { ctrl.close(); } catch { /* already closed */ }
    }
  }
}, 60_000).unref();

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
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  let heartbeatId: ReturnType<typeof setInterval>;
  let activeController: ReadableStreamDefaultController | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Reject if at capacity
      if (connections.size >= MAX_SSE_CONNECTIONS) {
        controller.close();
        return;
      }
      activeController = controller;
      connections.set(controller, Date.now());

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
      heartbeatId = setInterval(() => {
        try {
          controller.enqueue(`: heartbeat\n\n`);
          connections.set(controller, Date.now()); // refresh timestamp
        } catch {
          clearInterval(heartbeatId);
          connections.delete(controller);
        }
      }, 30000);
    },

    cancel() {
      clearInterval(heartbeatId);
      if (activeController) connections.delete(activeController);
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
export function _broadcastHealthChange(data: { routeId: string,
  oldStatus: string, newStatus: string, timestamp: string;
  reason?: string;
}) {
  const message = `data: ${JSON.stringify({ type: 'health_change',
    ...data,
  })}\n\n`;

  console.log(`[SSE] Broadcasting health change for route ${data.routeId}: ${data.oldStatus} → ${data.newStatus}`);

  let successCount = 0;
  let failureCount = 0;

  for (const [controller] of connections) {
    try {
      controller.enqueue(message);
      connections.set(controller, Date.now());
      successCount++;
    } catch (error) {
      console.error('[SSE] Failed to send to client, removing connection:', error);
      connections.delete(controller);
      failureCount++;
    }
  }

  console.log(`[SSE] Broadcast complete: ${successCount} success, ${failureCount} failures`);
}

/**
 * Broadcast error count change to all connected clients
 *
 * Called when error clusters are created/resolved
 *
 * @param data - Error count change event data
 */
export function _broadcastErrorCountChange(data: { routeId: string,
  errorCount: number,
  warningCount?: number;
  infoCount?: number; timestamp: string;
}) {
  const message = `data: ${JSON.stringify({ type: 'error_count_change',
    ...data,
  })}\n\n`;

  console.log(`[SSE] Broadcasting error count change for route ${data.routeId}: ${data.errorCount} errors`);

  for (const [controller] of connections) {
    try {
      controller.enqueue(message);
      connections.set(controller, Date.now());
    } catch (error) {
      console.error('[SSE] Failed to send error count update:', error);
      connections.delete(controller);
    }
  }
}

/**
 * Get current connection count (for monitoring)
 */
export function _getConnectionCount(): number {
  return connections.size;
}






// Re-exported with _ prefix for SvelteKit compliance (sibling routes import these)
// SvelteKit only allows GET, POST, PATCH, PUT, DELETE, OPTIONS, HEAD, fallback,
// prerender, trailingSlash, config, entries, or anything with a '_' prefix
