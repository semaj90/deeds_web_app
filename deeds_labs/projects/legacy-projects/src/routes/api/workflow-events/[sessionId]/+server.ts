/**
 * Server-Sent Events (SSE) Endpoint for Workflow Events
 *
 * Streams real-time workflow updates from Redis Pub/Sub to the frontend
 *
 * Usage:
 *   GET /api/workflow-events/{sessionId}
 *
 * Returns a persistent SSE connection that sends workflow events as they occur
 */

import { createSubscriber } from '$lib/server/bootstrap/redis';
import type { RequestHandler } from './$types';
import type IORedis from 'ioredis';

// Event types that can be sent to the client
export interface WorkflowEvent {
  type:
    | 'SSE_CONNECTED'
    | 'OCR_COMPLETE'
    | 'OCR_ERROR'
    | 'EMBEDDING_COMPLETE'
    | 'EMBEDDING_ERROR'
    | 'ENTITY_COMPLETE'
    | 'ENTITY_ERROR'
    | 'SUMMARY_COMPLETE'
    | 'SUMMARY_ERROR'
    | 'WORKFLOW_COMPLETE'
    | 'WORKFLOW_ERROR'
    | 'HEARTBEAT';
  timestamp: string;
  sessionId: string;
  evidenceId?: string;
  result?: any;
  error?: string;
}

/**
 * GET handler for SSE connection
 */
export const GET: RequestHandler = async ({ params }) => {
  const { sessionId } = params;

  if (!sessionId) {
    return new Response('Missing sessionId', { status: 400 });
  }

  const channel = `workflow:session:${sessionId}`;
  let subscriber: IORedis | null = null;
  let heartbeatInterval: NodeJS.Timeout | null = null;

  // Create a ReadableStream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      // Helper to send SSE message
      const sendEvent = (event: WorkflowEvent) => {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(new TextEncoder().encode(data));
      };

      // Send initial connection event
      sendEvent({
        type: 'SSE_CONNECTED',
        timestamp: new Date().toISOString(),
        sessionId,
      });

      try {
        // Create Redis subscriber
        subscriber = createSubscriber();

        // Subscribe to the workflow session channel
        await subscriber.subscribe(channel);

        // Handle incoming messages from Redis
        subscriber.on('message', (ch: string, message: string) => {
          if (ch === channel) {
            try {
              const event = JSON.parse(message) as WorkflowEvent;
              sendEvent(event);
            } catch (error) {
              console.error('[SSE] Failed to parse Redis message:', error);
            }
          }
        });

        // Send heartbeat every 30 seconds to keep connection alive
        heartbeatInterval = setInterval(() => {
          sendEvent({
            type: 'HEARTBEAT',
            timestamp: new Date().toISOString(),
            sessionId,
          });
        }, 30000);

        console.log(`[SSE] Client connected to workflow session: ${sessionId}`);
      } catch (error) {
        console.error('[SSE] Error setting up SSE connection:', error);
        controller.error(error);
      }
    },

    cancel() {
      // Cleanup on client disconnect
      console.log(`[SSE] Client disconnected from workflow session: ${sessionId}`);

      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }

      if (subscriber) {
        subscriber.unsubscribe(channel);
        subscriber.quit();
        subscriber = null;
      }
    },
  });

  // Return SSE response with proper headers
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      // Enable CORS if needed
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
