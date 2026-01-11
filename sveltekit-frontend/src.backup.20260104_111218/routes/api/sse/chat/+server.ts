import { produce } from 'sveltekit-sse';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = async ({ request }) => {
    const { message, model } = await request.json();

    const stream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder();
            const id = crypto.randomUUID();

            const send = (data: any) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            };

            send({ 
                id, 
                role: 'assistant', 
                content: '', 
                status: 'thinking' 
            });

            // Simulate processing
            await new Promise(r => setTimeout(r, 500));

            send({ 
                id, 
                role: 'assistant', 
                content: 'I received your message: ' + message, 
                status: 'streaming' 
            });

            send({ 
                id, 
                role: 'assistant', 
                content: '', 
                status: 'done' 
            });

            controller.close();
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
