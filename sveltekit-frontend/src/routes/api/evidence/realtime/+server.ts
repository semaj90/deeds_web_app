import type { RequestHandler } from './$types';

/**
 * SSE Endpoint for Real-time Evidence Updates
 * Subscribes to Redis/Postgres events for evidence processing status
 */
export const GET: RequestHandler = async ({ url, locals }) => {
    // 1. Auth Guard
    if (!locals.user) {
        return new Response('Unauthorized', { status: 401 });
    }

    const userId = locals.user.id;
    const encoder = new TextEncoder();

    // 2. Create ReadableStream
    const stream = new ReadableStream({
        start(controller) {
            // Send initial connection message
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', userId })}\n\n`));

            // Setup keep-alive interval (every 30s)
            const keepAlive = setInterval(() => {
                controller.enqueue(encoder.encode(': keep-alive\n\n'));
            }, 30000);

            // TODO: Hook into actual event bus (Redis PubSub or Postgres Notify)
            // For now, we simulate processing updates if a 'simulate' param is present
            if (url.searchParams.has('simulate')) {
                let progress = 0;
                const interval = setInterval(() => {
                    progress += 10;
                    if (progress > 100) {
                        clearInterval(interval);
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'complete', docId: '123' })}\n\n`));
                    } else {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'progress', progress, status: 'processing' })}\n\n`));
                    }
                }, 1000);
            }

            // Cleanup on close
            return () => {
                clearInterval(keepAlive);
                // remove event listeners
            };
        },
        cancel() {
            // client disconnected
        }
    });

    // 3. Return SSE Response
    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no' // Important for Nginx proxy
        }
    });
};
