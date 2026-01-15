import { db } from '$lib/server/db/client';
import { chatMessages, chatSessions } from '$lib/server/db/schema-postgres';
import { desc, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

/**
 * Server-Sent Events endpoint for contextual chat streaming
 * Replaces WebSocket for simpler, more reliable real-time updates
 *
 * Benefits over WebSocket:
 * - Auto-reconnect built-in (EventSource API)
 * - Works over HTTP/2
 * - Simpler error handling
 * - No need for persistent connection management
 *
 * Supports two modes:
 * 1. Query mode: ?q=query&mode=ollama (simple streaming without session)
 * 2. Session mode: ?sessionId=xxx (full chat history + streaming)
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const query = url.searchParams.get('q');
	const mode = url.searchParams.get('mode') || 'ollama';
	const sessionId = url.searchParams.get('sessionId');

	// Query mode: Simple streaming without authentication/session
	if (query && !sessionId) {
		return handleQueryMode(query, mode);
	}

	// Session mode: Requires authentication
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	if (!sessionId) {
		return new Response('Missing query or sessionId parameter', { status: 400 });
	}

	// Verify session belongs to user
	const session = await db
		.select()
		.from(chatSessions)
		.where(eq(chatSessions.id, sessionId))
		.limit(1);

	if (!session.length || session[0].userId !== locals.user.id) {
		return new Response('Session not found or unauthorized', { status: 404 });
	}

	return handleSessionMode(sessionId);
};

/**
 * Query Mode: Simple streaming without session
 * Used for testing and simple queries
 */
function handleQueryMode(query: string, mode: string): Response {
	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();

			const send = (data: unknown) => {
				const message = `data: ${JSON.stringify(data)}\n\n`;
				controller.enqueue(encoder.encode(message));
			};

			try {
				// Send initial metadata
				send({ type: 'start', query, mode, timestamp: new Date().toISOString() });

				// Import LLM router dynamically
				const { llmRouter } = await import('$lib/server/llm-router');

				// Stream response
				const stream = await llmRouter.generateStream({
					prompt: query,
					provider: mode === 'rag' ? 'gemini' : 'ollama',
					model: mode === 'rag' ? 'gemini-2.0-flash-exp' : 'gemma3-legal:latest'
				});

				for await (const chunk of stream) {
					send({ type: 'token', content: chunk.content || chunk.text });
				}

				send({ type: 'done' });
				controller.close();
			} catch (error) {
				send({
					type: 'error',
					error: error instanceof Error ? error.message : 'Unknown error'
				});
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive'
		}
	});
}

/**
 * Session Mode: Full chat history + streaming
 */
function handleSessionMode(sessionId: string): Response {
	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();

			// Helper to send SSE message
			const send = (event: string, data: unknown) => {
				const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
				controller.enqueue(encoder.encode(message));
			};

			// Send initial connection message
			send('connected', { sessionId, timestamp: new Date().toISOString() });

			// Poll for new messages (simplified - in production, use Redis pub/sub)
			let lastMessageId: string | null = null;
			const pollInterval = setInterval(async () => {
				try {
					const query = db
						.select()
						.from(chatMessages)
						.where(eq(chatMessages.sessionId, sessionId))
						.orderBy(desc(chatMessages.createdAt))
						.limit(10);

					if (lastMessageId) {
						// Get messages newer than last seen
						const messages = await query;
						const newMessages = messages.filter(m => m.id > lastMessageId!);

						for (const msg of newMessages.reverse()) {
							send('message', {
								id: msg.id,
								role: msg.role,
								content: msg.content,
								timestamp: msg.createdAt
							});
							lastMessageId = msg.id;
						}
					} else {
						// First poll - get latest message
						const messages = await query;
						if (messages.length > 0) {
							lastMessageId = messages[0].id;
							send('message', {
								id: messages[0].id,
								role: messages[0].role,
								content: messages[0].content,
								timestamp: messages[0].createdAt
							});
						}
					}
				} catch (error) {
					console.error('SSE poll error:', error);
					send('error', { message: 'Failed to fetch messages' });
				}
			}, 1000); // Poll every second

			// Cleanup on client disconnect
			const cleanup = () => {
				clearInterval(pollInterval);
				controller.close();
			};

			// Listen for abort signal
			if (controller.signal) {
				controller.signal.addEventListener('abort', cleanup);
			}

			// Keep-alive ping every 30 seconds
			const keepAlive = setInterval(() => {
				send('ping', { timestamp: new Date().toISOString() });
			}, 30000);

			// Cleanup keep-alive
			controller.signal?.addEventListener('abort', () => {
				clearInterval(keepAlive);
			});
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
			'X-Accel-Buffering': 'no' // Disable nginx buffering
		}
	});
};

/**
 * POST endpoint to send messages (trigger streaming response)
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	const { sessionId, message } = await request.json();

	if (!sessionId || !message) {
		return new Response('Missing required fields', { status: 400 });
	}

	try {
		// Save user message
		await db.insert(chatMessages).values({
			sessionId,
			role: 'user',
			content: message,
			createdAt: new Date()
		});

		// ✅ Trigger AI response generation with RAG/KAG streaming
		await generateAIResponse(sessionId, message: locals.user.id);

		return new Response(JSON.stringify({ success: true }), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('Failed to save message:', error);
		return new Response('Failed to save message', { status: 500 });
	}
};

/**
 * ✅ Phase 97: AI Response Generator with RAG/KAG/DAG Integration
 * - Streams chunks via SSE
 * - Saves to database incrementally
 * - Uses RabbitMQ for async embedding generation
 */
async function generateAIResponse(sessionId: string, userMessage: string, userId: string) {
	try {
		// Import streaming utilities
		const { streamRAGResponse } = await import('$lib/server/streaming/chunked-response');

		// Start streaming RAG response
		let fullResponse = '';
		let chunkCount = 0;

		for await (const chunk of streamRAGResponse(userMessage)) {
			if (chunk.type === 'content' && chunk.content) {
				fullResponse += chunk.content;
				chunkCount++;

				// Save every 10 chunks for real-time updates
				if (chunkCount % 10 === 0) {
					await db.insert(chatMessages).values({
						sessionId,
						role: 'assistant',
						content: fullResponse,
						createdAt: new Date(),
						metadata: {
							streaming: true,
							chunks: chunkCount,
							confidence: chunk.metadata?.confidence || 0.8
						}
					}).onConflictDoUpdate({
						target: chatMessages.id,
						set: { content: fullResponse, updatedAt: new Date() }
					});
				}
			} else if (chunk.type === 'done') {
				// Final save with complete response
				await db.insert(chatMessages).values({
					sessionId,
					role: 'assistant',
					content: fullResponse,
					createdAt: new Date(),
					metadata: {
						streaming: false,
						chunks: chunkCount,
						confidence: chunk.metadata?.confidence || 0.8,
						sources: chunk.metadata?.sources || []
					}
				});

				// Queue embedding generation via RabbitMQ (async)
				try {
					const { publishToQueue } = await import('$lib/server/rabbitmq');
					await publishToQueue('embedding.generation', {
						type: 'chat_message',
						sessionId,
						userId,
						message: fullResponse
					});
				} catch (rabbitError) {
					console.warn('RabbitMQ not available:', rabbitError);
					// Continue without queuing - non-critical
				}
			}
		}
	} catch (error) {
		console.error('AI response generation failed:', error);
		// Save error message
		await db.insert(chatMessages).values({
			sessionId,
			role: 'assistant',
			content: 'Sorry, I encountered an error processing your request.',
			createdAt: new Date(),
			metadata: {
				error: true,
				message: error instanceof Error ? error.message : 'Unknown error'
			}
		});
	}
}


