import { produce } from 'sveltekit-sse';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { messages } from '$lib/server/db/schema';
import { ollamaService } from '$lib/server/ai/ollama-service';
import { eq } from 'drizzle-orm';

export const POST: RequestHandler = async ({ request }) => {
    const { message, model, conversationId } = await request.json();

    if (!conversationId) {
        return new Response('Missing conversationId', { status: 400 });
    }

    // 1. Save user message
    try {
        await db.insert(messages).values({
            conversationId,
            role: 'user',
            content: message,
            model: model || 'gemma3-legal-latest'
        });
    } catch (e) {
        console.error('Failed to save user message', e);
    }

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

            // Accumulate response for DB
            let fullResponse = '';

            try {
                // Generate response (simulate streaming if service doesn't support it natively yet)
                const result = await ollamaService.generate(message, { model });

                // Mock streaming effect for UI responsiveness if the backend wasn't truly streaming
                const chunks = result.response.match(/.{1,20}/g) || [result.response];

                for (const chunk of chunks) {
                    await new Promise(r => setTimeout(r, 50)); // artificial delay for effect
                    fullResponse += chunk;
                    send({
                        id,
                        role: 'assistant',
                        content: fullResponse,
                        status: 'streaming'
                    });
                }

                // Save assistant message
                await db.insert(messages).values({
                    conversationId,
                    role: 'assistant',
                    content: fullResponse,
                    model: result.model,
                    tokensUsed: result.eval_count || 0,
                    finishReason: result.done ? 'stop' : 'unknown'
                });

                send({
                    id,
                    role: 'assistant',
                    content: fullResponse,
                    status: 'done'
                });

            } catch (error) {
                console.error('Generation error:', error);
                send({
                    id,
                    role: 'assistant',
                    content: 'Sorry, I encountered an error generating a response.',
                    status: 'error'
                });
            }

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

