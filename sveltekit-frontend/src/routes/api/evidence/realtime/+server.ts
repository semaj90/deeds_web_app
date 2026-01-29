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

    // Track intervals for cleanup
    let keepAliveInterval: ReturnType<typeof setInterval> | null = null;
    let simulateInterval: ReturnType<typeof setInterval> | null = null;
    let isClosed = false;

    // 2. Create ReadableStream
    const stream = new ReadableStream({
        start(controller) {
            // Helper to safely enqueue data
            const safeEnqueue = (data: string) => {
                if (!isClosed) {
                    try {
                        controller.enqueue(encoder.encode(data));
                    } catch {
                        // Controller already closed, ignore
                        isClosed = true;
                        cleanup();
                    }
                }
            };

            // Cleanup function
            const cleanup = () => {
                if (keepAliveInterval) {
                    clearInterval(keepAliveInterval);
                    keepAliveInterval = null;
                }
                if (simulateInterval) {
                    clearInterval(simulateInterval);
                    simulateInterval = null;
                }
            };

            // Send initial connection message
            safeEnqueue(`data: ${JSON.stringify({ type: 'connected', userId })}\n\n`);

            // Setup keep-alive interval (every 30s)
            keepAliveInterval = setInterval(() => {
                safeEnqueue(': keep-alive\n\n');
            }, 30000);

            // TODO: Hook into actual event bus (Redis PubSub or Postgres Notify)
            // For now, we simulate processing updates if a 'simulate' param is present
            if (url.searchParams.has('simulate')) {
                let progress = 0;
                simulateInterval = setInterval(() => {
                    progress += 10;
                    if (progress > 100) {
                        if (simulateInterval) {
                            clearInterval(simulateInterval);
                            simulateInterval = null;
                        }
                        safeEnqueue(`data: ${JSON.stringify({ type: 'complete', docId: '123' })}\n\n`);
                    } else {
                        safeEnqueue(`data: ${JSON.stringify({ type: 'progress', progress, status: 'processing' })}\n\n`);
                    }
                }, 1000);
            }

            // Return cleanup function
            return cleanup;
        },
        cancel() {
            // Client disconnected
            isClosed = true;
            if (keepAliveInterval) {
                clearInterval(keepAliveInterval);
                keepAliveInterval = null;
            }
            if (simulateInterval) {
                clearInterval(simulateInterval);
                simulateInterval = null;
            }
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
