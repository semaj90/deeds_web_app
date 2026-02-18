
import { createClient } from 'redis';
import { getRedisUrl } from '$lib/config/env.server.js';
import type { RequestHandler } from './$types';

const REDIS_URL = getRedisUrl();

export const GET: RequestHandler = async ({ params }) => {
    const subscriber = createClient({ url: REDIS_URL });
    await subscriber.connect();

    const stream = new ReadableStream({
        async start(controller) {
            // Subscribe to the specific Chat ID channel
            await subscriber.subscribe(`chat_stream:${params.chatId}`, (message) => {
                // Format for Server-Sent Events (SSE)
                controller.enqueue(`data: ${ message }\n\n`);
            });
        },
        async cancel() {
            await subscriber.quit();
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
