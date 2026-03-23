import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { chatMetadata, chatMessages } from '$lib/server/db/schema.js';
import { eq, and } from 'drizzle-orm';

const updateConversationSchema = z.object({
	messages: z
		.array(
			z.object({
				role: z.enum(['user', 'assistant', 'system']),
				content: z.string()
			})
		)
		.optional(),
	title: z.string().max(255).optional()
});

/** PUT /api/conversations/[id] — Update conversation (save messages / rename) */
export const PUT: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) {
		return json({ message: 'Unauthorized' }, { status: 401 });
	}

	const conversationId = params.id;

	try {
		const raw = await request.json();
		const parsed = updateConversationSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ message: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const { messages, title } = parsed.data;

		// Upsert chat metadata
		await db
			.insert(chatMetadata)
			.values({
				chatId: conversationId,
				userId: locals.user.id,
				title: title ?? `Conversation ${new Date().toLocaleDateString()}`,
				createdAt: new Date(),
				updatedAt: new Date()
			})
			.onConflictDoUpdate({
				target: chatMetadata.chatId,
				set: {
					updatedAt: new Date(),
					lastMessageAt: new Date(),
					...(title ? { title } : {})
				}
			});

		// Persist messages if provided
		if (messages && messages.length > 0) {
			for (const msg of messages) {
				const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
				await db
					.insert(chatMessages)
					.values({
						id: msgId,
						chatId: conversationId,
						userId: locals.user.id,
						role: msg.role,
						content: msg.content
					})
					.onConflictDoNothing();
			}
		}

		return json({ success: true, conversationId });
	} catch (err) {
		console.error('[/api/conversations/[id]] PUT error:', err);
		return json({ message: 'Failed to save conversation' }, { status: 500 });
	}
};

/** DELETE /api/conversations/[id] — Delete a conversation and its messages */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		return json({ message: 'Unauthorized' }, { status: 401 });
	}

	const conversationId = params.id;

	try {
		// Delete messages first (FK constraint)
		await db
			.delete(chatMessages)
			.where(eq(chatMessages.chatId, conversationId));

		// Delete metadata
		await db
			.delete(chatMetadata)
			.where(
				and(
					eq(chatMetadata.chatId, conversationId),
					eq(chatMetadata.userId, locals.user.id)
				)
			);

		return json({ success: true });
	} catch (err) {
		console.error('[/api/conversations/[id]] DELETE error:', err);
		return json({ message: 'Failed to delete conversation' }, { status: 500 });
	}
};