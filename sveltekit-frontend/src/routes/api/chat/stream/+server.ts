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
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	// Auth guard
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	const sessionId = url.searchParams.get('sessionId');
	if (!sessionId) {
		return new Response('Missing sessionId', { status: 400 });
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

	// Create SSE stream
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

		// TODO: Trigger AI response generation (async)
		// This would integrate with your RAG/KAG/DAG SDK

		return new Response(JSON.stringify({ success: true }), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('Failed to save message:', error);
		return new Response('Failed to save message', { status: 500 });
	}
};

