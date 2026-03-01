import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { chatMessages } from '$lib/server/db/schema-postgres';
import { chatMetadata } from '$lib/server/db/schema-chat';
import { eq, and } from 'drizzle-orm';

/**
 * POST /api/cases/[id]/chat
 * Save chat history for evidence board
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	try {
		const { id } = params;
		const user = locals.user;

		if (!user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const body = await request.json();
		const { chatId, messages, metadata } = body;

		if (!chatId || !messages || !Array.isArray(messages)) {
			return json({ error: 'Invalid request body' }, { status: 400 });
		}

		// Save each message to the database
		const savedMessages = [];
		for (const msg of messages) {
			const msgId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
			const [saved] = await db
				.insert(chatMessages)
				.values({
					id: msgId,
					userId: user.id,
					chatId,
					role: msg.role,
					content: msg.content,
					metadata: msg.metadata ? JSON.stringify(msg.metadata) : null,
					timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date()
				})
				.onConflictDoNothing()
				.returning();

			if (saved) savedMessages.push(saved);
		}

		// Update chat metadata
		await db
			.insert(chatMetadata)
			.values({
				chatId,
				userId: user.id,
				caseId: id,
				messageCount: messages.length.toString(),
				lastMessageAt: new Date(),
				tags: metadata ? JSON.stringify(metadata) : null
			})
			.onConflictDoUpdate({
				target: chatMetadata.chatId,
				set: {
					messageCount: messages.length.toString(),
					lastMessageAt: new Date(),
					tags: metadata ? JSON.stringify(metadata) : null
				}
			});

		return json({
			success: true,
			savedCount: savedMessages.length,
			message: 'Chat history saved successfully'
		});
	} catch (e) {
		console.error('[api/cases/[id]/chat] POST failed:', e);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

/**
 * GET /api/cases/[id]/chat
 * Retrieve chat history for evidence board
 */
export const GET: RequestHandler = async ({ params, locals, url }) => {
	try {
		const { id } = params;
		const user = locals.user;

		if (!user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const chatId = url.searchParams.get('chatId') || `board-${id}`;

		// Fetch messages for this chat
		const rawMessages = await db
			.select()
			.from(chatMessages)
			.where(and(eq(chatMessages.chatId, chatId), eq(chatMessages.userId, user.id)))
			.orderBy(chatMessages.timestamp);

		// Parse metadata JSON strings
		const messages = rawMessages.map(msg => ({
			...msg,
			metadata: msg.metadata ? JSON.parse(msg.metadata) : null
		}));

		// Fetch metadata
		const [meta] = await db
			.select()
			.from(chatMetadata)
			.where(eq(chatMetadata.chatId, chatId))
			.limit(1);

		return json({
			success: true,
			chatId,
			messages,
			metadata: meta?.tags ? JSON.parse(meta.tags) : {}
		});
	} catch (e) {
		console.error('[api/cases/[id]/chat] GET failed:', e);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
