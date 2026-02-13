import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { chatMessages } from '$lib/server/db/schema';

// TODO: Wire up sveltekit-sse produce() for cleaner SSE patterns
// TODO: Integrate Redis cache for chat session optimization
// TODO: Add RabbitMQ embedding.generation queue for async embedding of chat messages
// TODO: Add Qdrant vector tagging for semantic chat retrieval
// TODO: IndexedDB + Loki.js client-side caching for offline chat history

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';

export const POST: RequestHandler = async ({ request }) => {
	const { message, model, conversationId } = await request.json();

	if (!conversationId) {
		return new Response('Missing conversationId', { status: 400 });
	}

	// 1. Save user message to chatMessages table
	// TODO: Add userId from locals.user once auth is wired into this SSE endpoint
	try {
		await db.insert(chatMessages).values({
			chatId: conversationId,
			role: 'user',
			content: message,
		});
	} catch (e) {
		console.error('Failed to save user message', e);
	}

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();
			const id = crypto.randomUUID();

			const send = (data: unknown) => {
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
			};

			send({ id, role: 'assistant', content: '', status: 'thinking' });

			let fullResponse = '';

			try {
				// Stream from Ollama using gemma3-legal:latest
				const ollamaRes = await fetch(`${OLLAMA_URL}/api/generate`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						model: model ?? 'gemma3-legal:latest',
						prompt: message,
						stream: true,
					}),
				});

				if (!ollamaRes.ok || !ollamaRes.body) {
					throw new Error(`Ollama error: ${ollamaRes.status}`);
				}

				const reader = ollamaRes.body.getReader();
				const decoder = new TextDecoder();

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					const text = decoder.decode(value, { stream: true });
					for (const line of text.split('\n').filter(Boolean)) {
						try {
							const parsed = JSON.parse(line);
							if (parsed.response) {
								fullResponse += parsed.response;
								send({ id, role: 'assistant', content: fullResponse, status: 'streaming' });
							}
						} catch {
							// skip malformed JSON lines
						}
					}
				}

				// Save assistant message
				await db.insert(chatMessages).values({
					chatId: conversationId,
					role: 'assistant',
					content: fullResponse,
				});

				send({ id, role: 'assistant', content: fullResponse, status: 'done' });
			} catch (error) {
				console.error('Generation error:', error);
				send({
					id,
					role: 'assistant',
					content: 'Sorry, I encountered an error generating a response.',
					status: 'error',
				});
			}

			controller.close();
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
		},
	});
};