import { db } from '$lib/server/db/client';
import { chatMessages, chatMetadata } from '$lib/server/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { acquireGpuLease } from '$lib/server/inference/gpu-arbiter.js';
import { z } from 'zod';
import { isUuid } from '$lib/server/validation.js';

const chatStreamPostSchema = z.object({
	sessionId: z.string().min(1, 'Missing sessionId').max(200),
	message: z.string().min(1, 'Missing message').max(50000),
	caseId: z.string().uuid().optional()
});

/**
 * Server-Sent Events endpoint for contextual chat streaming
 * Case-aware: injects case context (evidence, citations) into AI prompts
 *
 * Supports two modes:
 * 1. Query mode: ?q=query&mode=ollama&caseId=xxx (streaming, optional case context)
 * 2. Session mode: ?sessionId=xxx (full chat history + streaming)
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const query = url.searchParams.get('q');
	const mode = url.searchParams.get('mode') ?? 'ollama';
	const sessionId = url.searchParams.get('sessionId');
	const caseId = url.searchParams.get('caseId');
	const persona = url.searchParams.get('persona') ?? 'neutral';

	// Query mode: Simple streaming without authentication/session
	if (query && !sessionId) {
		if (!locals.user?.id) {
      return new Response('Unauthorized', { status: 401 });
    }
    if (caseId && !isUuid(caseId)) {
      return new Response('Invalid case ID format', { status: 400 });
    }
    return handleQueryMode(query, mode, caseId, persona, locals.user.id);
	}

	// Session mode: Requires authentication
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	if (!sessionId) {
		return new Response('Missing query or sessionId parameter', { status: 400 });
	}

	// Verify session belongs to user via chatMetadata
	const sessionMeta = await db
		.select()
		.from(chatMetadata)
		.where(eq(chatMetadata.chatId, sessionId))
		.limit(1);

	if (sessionMeta.length > 0 && sessionMeta[0].userId !== locals.user.id) {
		return new Response('Session not found or unauthorized', { status: 404 });
	}

	// Get case association from metadata
	const sessionCaseId = sessionMeta[0]?.caseId ?? caseId ?? null;

	return handleSessionMode(sessionId, sessionCaseId, locals.user.id);
};

/**
 * Load case context from DB for injection into AI prompts
 */
async function loadCaseContext(caseId: string, userId?: string): Promise<string | null> {
  try {
    const { cases } = await import('$lib/server/db/schema');

    const caseRows = await db
      .select()
      .from(cases)
      .where(userId ? and(eq(cases.id, caseId), eq(cases.userId, Number(userId))) : eq(cases.id, caseId))
      .limit(1);

    if (!caseRows.length) return null;

    const c = caseRows[0];
    let context = `## Active Case Context\n`;
    context += `- **Title**: ${c.title}\n`;
    if (c.caseNumber) context += `- **Case #**: ${c.caseNumber}\n`;
    if (c.jurisdiction) context += `- **Jurisdiction**: ${c.jurisdiction}\n`;
    if (c.court) context += `- **Court**: ${c.court}\n`;
    if (c.status) context += `- **Status**: ${c.status}\n`;
    if (c.description) context += `- **Description**: ${c.description}\n`;

    // Load recent evidence for this case
    try {
      const { evidence } = await import('$lib/server/db/schema');
      const evidenceRows = await db
        .select()
        .from(evidence)
        .where(eq(evidence.caseId, caseId))
        .limit(5);

      if (evidenceRows.length > 0) {
        context += `\n## Evidence (${evidenceRows.length} items)\n`;
        for (const e of evidenceRows) {
          context += `- ${e.title ?? e.fileType ?? 'Untitled'}: ${e.description ?? ''}\n`;
        }
      }
    } catch {
      // Evidence table may not exist yet
    }

    // Load citations linked to this case
    try {
      const { savedCitations } = await import('$lib/server/db/schema');
      const citationRows = await db
        .select()
        .from(savedCitations)
        .where(eq(savedCitations.caseId, caseId))
        .limit(10);

      if (citationRows.length > 0) {
        context += `\n## Citations (${citationRows.length} items)\n`;
        for (const cit of citationRows) {
          context += `- ${cit.statuteCode}: ${cit.statuteTitle ?? ''}\n`;
        }
      }
    } catch {
      // Citations table may not exist yet
    }

    return context;
  } catch (error) {
    console.warn('Failed to load case context:', error);
    return null;
  }
}

/**
 * Query Mode: Simple streaming with optional case context
 */
function handleQueryMode(
  query: string,
  mode: string,
  caseId: string | null,
  persona: string = 'neutral',
  userId?: string
): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (data: unknown) => {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      try {
        // Acquire GPU lease for Ollama streaming (non-blocking)
        await acquireGpuLease('ollama', 120).catch(() => null);

        send({ type: 'start', query, mode, caseId, timestamp: new Date().toISOString() });

        // Load case context if available
        let caseContext = '';
        if (caseId) {
          const ctx = await loadCaseContext(caseId, userId);
          if (ctx) {
            caseContext = ctx;
            send({ type: 'case_context', caseId, hasContext: true });
          }
        }

        // Apply persona styling to prompt
        let systemPrefix = '';
        if (persona && persona !== 'neutral') {
          const { getPersona } = await import('$lib/server/ace/style-adapter.js');
          const config = getPersona(persona as Parameters<typeof getPersona>[0]);
          systemPrefix = config.systemPrefix + '\n\n';
        }

        // Build prompt with case context + persona
        const prompt =
          systemPrefix + (caseContext ? `${caseContext}\n\n## User Question\n${query}` : query);

        // Import LLM router dynamically
        const { llmRouter } = await import('$lib/server/llm-router');

        // Stream response
        const responseStream = await llmRouter.generateStream({
          prompt,
          provider: 'ollama',
          model: 'gemma4-legal:latest',
        });

        for await (const chunk of responseStream) {
          send({ type: 'token', content: chunk?.content || chunk.text });
        }

        send({ type: 'done' });
        controller.close();
      } catch (error) {
        send({
          type: 'error',
          error: 'Stream error',
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

/**
 * Session Mode: Full chat history + streaming with case context
 */
function handleSessionMode(sessionId: string, caseId: string | null, userId: string): Response {
  let pollIntervalId: ReturnType<typeof setInterval>;
  let keepAliveId: ReturnType<typeof setInterval>;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (event: string, data: unknown) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      send('connected', { sessionId, caseId, timestamp: new Date().toISOString() });

      // Poll for new messages
      let lastMessageId: string | null = null;
      pollIntervalId = setInterval(async () => {
        try {
          const messages = await db
            .select()
            .from(chatMessages)
            .where(and(eq(chatMessages.chatId, sessionId), eq(chatMessages.userId, userId)))
            .orderBy(desc(chatMessages.createdAt))
            .limit(10);

          if (lastMessageId) {
            const newMessages = messages.filter((m) => m.id > lastMessageId!);

            for (const msg of newMessages.reverse()) {
              send('message', {
                id: msg.id,
                role: msg.role,
                content: msg.content,
                timestamp: msg.createdAt,
              });
              lastMessageId = msg.id;
            }
          } else {
            if (messages.length > 0) {
              lastMessageId = messages[0].id;
              send('message', {
                id: messages[0].id,
                role: messages[0].role,
                content: messages[0].content,
                timestamp: messages[0].createdAt,
              });
            }
          }
        } catch (error) {
          console.error('SSE poll error:', error);
          send('error', { message: 'Failed to fetch messages' });
        }
      }, 1000);

      // Keep-alive ping every 30 seconds
      keepAliveId = setInterval(() => {
        send('ping', { timestamp: new Date().toISOString() });
      }, 30000);
    },

    cancel() {
      clearInterval(pollIntervalId);
      clearInterval(keepAliveId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

/**
 * POST endpoint to send messages (trigger streaming response)
 * Supports case association via caseId parameter
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	const raw = await request.json();
	const parsed = chatStreamPostSchema.safeParse(raw);
	if (!parsed.success) {
		return new Response(parsed.error.issues[0]?.message ?? 'Invalid input', { status: 400 });
	}
	const { sessionId, message, caseId } = parsed.data;

	try {
		if (caseId) {
      const ctx = await loadCaseContext(caseId, locals.user.id);
      if (!ctx) {
        return new Response('Case not found', { status: 404 });
      }
    }

		// Ensure chat metadata exists (upsert session with case association)
		await db
			.insert(chatMetadata)
			.values({
				chatId: sessionId,
				userId: locals.user.id,
				caseId: caseId ?? null,
				title: message.slice(0, 100),
				createdAt: new Date(),
				updatedAt: new Date()
			})
			.onConflictDoUpdate({
				target: chatMetadata.chatId,
				set: {
					updatedAt: new Date(),
					lastMessageAt: new Date(),
					...(caseId ? { caseId } : {})
				}
			});

		// Save user message
		const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
		await db.insert(chatMessages).values({
			id: msgId,
			chatId: sessionId,
			userId: locals.user.id,
			role: 'user',
			content: message
		});

		// Load case context for AI response
		const sessionMeta = await db
			.select()
			.from(chatMetadata)
			.where(eq(chatMetadata.chatId, sessionId))
			.limit(1);

		const resolvedCaseId = sessionMeta[0]?.caseId ?? caseId ?? null;

		// Trigger AI response generation
		await generateAIResponse(sessionId, message, locals.user.id, resolvedCaseId);

		return new Response(JSON.stringify({ success: true, sessionId, caseId: resolvedCaseId }), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('Failed to save message:', error);
		return new Response('Failed to save message', { status: 500 });
	}
};

/**
 * AI Response Generator with RAG/KAG/DAG Integration
 * Case-aware: injects case context into prompts for relevant responses
 */
async function generateAIResponse(
	sessionId: string,
	userMessage: string,
	userId: string,
	caseId: string | null
) {
	try {
		// Load case context
		let caseContext = '';
		if (caseId) {
			const ctx = await loadCaseContext(caseId, userId);
			if (ctx) caseContext = ctx;
		}

		// Build case-aware prompt
		const prompt = caseContext
			? `${caseContext}\n\n## User Question\n${userMessage}`
			: userMessage;

		// Import streaming utilities
		const { streamRAGResponse } = await import('$lib/server/streaming/chunked-response');

		let fullResponse = '';
		let chunkCount = 0;
		const assistantMsgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

		for await (const chunk of streamRAGResponse(prompt)) {
			if (chunk.type === 'content' && chunk.content) {
				fullResponse += chunk.content;
				chunkCount++;

				// Save every 10 chunks for real-time updates
				if (chunkCount % 10 === 0) {
					await db
						.insert(chatMessages)
						.values({
							id: assistantMsgId,
							chatId: sessionId,
							userId,
							role: 'assistant',
							content: fullResponse,
							metadata: JSON.stringify({
								streaming: true,
								chunks: chunkCount,
								caseId,
								confidence: chunk.metadata?.confidence ?? 0.8
							})
						})
						.onConflictDoUpdate({
							target: chatMessages.id,
							set: {
								content: fullResponse,
								metadata: JSON.stringify({
									streaming: true,
									chunks: chunkCount,
									caseId,
									confidence: chunk.metadata?.confidence ?? 0.8
								}),
								updatedAt: new Date()
							}
						});
				}
			} else if (chunk.type === 'done') {
				// Final save with complete response
				await db
					.insert(chatMessages)
					.values({
						id: assistantMsgId,
						chatId: sessionId,
						userId,
						role: 'assistant',
						content: fullResponse,
						metadata: JSON.stringify({
							streaming: false,
							chunks: chunkCount,
							caseId,
							confidence: chunk.metadata?.confidence ?? 0.8,
							sources: chunk.metadata?.sources || []
						})
					})
					.onConflictDoUpdate({
						target: chatMessages.id,
						set: {
							content: fullResponse,
							metadata: JSON.stringify({
								streaming: false,
								chunks: chunkCount,
								caseId,
								confidence: chunk.metadata?.confidence ?? 0.8,
								sources: chunk.metadata?.sources || []
							}),
							updatedAt: new Date()
						}
					});

				// Update chat metadata message count
				await db
					.update(chatMetadata)
					.set({
						lastMessageAt: new Date(),
						updatedAt: new Date()
					})
					.where(eq(chatMetadata.chatId, sessionId));

				// Queue embedding generation via RabbitMQ (async, non-critical)
				try {
					const { publishToQueue } = await import('$lib/server/rabbitmq');
					await publishToQueue('embedding.generation', {
						type: 'chat_message',
						sessionId,
						userId,
						caseId,
						message: fullResponse
					});
				} catch {
					// RabbitMQ not available - non-critical
				}
			}
		}
	} catch (error) {
		console.error('AI response generation failed:', error);
		const errorMsgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
		await db.insert(chatMessages).values({
			id: errorMsgId,
			chatId: sessionId,
			userId,
			role: 'assistant',
			content: 'Sorry, I encountered an error processing your request.',
			metadata: JSON.stringify({
				error: true,
				caseId,
				message: 'Stream error'
			})
		});
	}
}
