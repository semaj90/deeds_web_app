/**
 * GET /api/audio/progress/[evidenceId]
 *
 * Server-Sent Events (SSE) endpoint for real-time audio processing progress
 * Polls Redis for status updates and streams to client
 */
import type { RequestHandler } from './$types';
import { getRedis } from '$lib/server/redis';

export const GET: RequestHandler = async ({ params, locals }) => {
  const { evidenceId } = params;

  // Auth check
  if (!locals.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const redis = getRedis();

  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Poll Redis every 500ms for status updates
      const interval = setInterval(async () => {
        try {
          const statusJson = await redis.get(`audio:status:${evidenceId}`);

          if (!statusJson) {
            // No status found - might be complete or error
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  stage: 'error',
                  progress: 0,
                  message: 'Processing status not found'
                })}\n\n`
              )
            );
            clearInterval(interval);
            controller.close();
            return;
          }

          const status = JSON.parse(statusJson);

          // Send status update
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(status)}\n\n`)
          );

          // Close stream if complete or error
          if (status.stage === 'complete' || status.stage === 'error') {
            clearInterval(interval);
            controller.close();
          }
        } catch (err) {
          console.error('Error polling audio status:', err);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                stage: 'error',
                progress: 0,
                message: 'Failed to retrieve processing status'
              })}\n\n`
            )
          );
          clearInterval(interval);
          controller.close();
        }
      }, 500); // Poll every 500ms

      // Cleanup on client disconnect
      return () => {
        clearInterval(interval);
      };
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
};