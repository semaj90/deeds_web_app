import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { chatMessages, chatMetadata, insertChatMessageSchema } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { recordChatMessageForRecall } from '$lib/server/ace/chat-memory.js';

const createMessageSchema = insertChatMessageSchema.extend({
	role: z.enum(['user', 'assistant', 'system']),
	synthesizedInput: z.string().nullable().optional(),
	legalAnalysis: z.string().nullable().optional(),
	ragResults: z.string().nullable().optional(),
	confidence: z.string().nullable().optional(),
	processingTime: z.string().nullable().optional(),
	aiMetadata: z.record(z.string(), z.unknown()).nullable().optional()
});

/** POST /api/v1/chat/messages — Save a chat message to a session */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const raw = await request.json();
		const parsed = createMessageSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const { sessionId, role, content, confidence, processingTime, aiMetadata } = parsed.data;
		const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

		await db.insert(chatMessages).values({
      id: msgId,
      chatId: sessionId,
      userId: null,
      role,
      content,
      metadata: JSON.stringify({
        confidence: confidence ?? null,
        processingTime: processingTime ?? null,
        ...(aiMetadata ?? {}),
      }),
    });

		// Update session timestamp
		await db
			.update(chatMetadata)
			.set({ updatedAt: new Date(), lastMessageAt: new Date() })
			.where(eq(chatMetadata.chatId, sessionId));

		// Fire-and-forget: embed content and upsert into Qdrant chat_messages
		// for future semantic recall across sessions.
		void recordChatMessageForRecall({ id: msgId, sessionId, role, content });

		return json({ success: true, messageId: msgId }, { status: 201 });
	} catch (err) {
		console.error('[/api/v1/chat/messages] POST error:', err);
		return json({ error: 'Failed to save message' }, { status: 500 });
	}
};

