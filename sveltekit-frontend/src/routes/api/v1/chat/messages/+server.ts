import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { chatMessages, chatMetadata } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';

const createMessageSchema = z.object({
	sessionId: z.string().min(1),
	role: z.enum(['user', 'assistant', 'system']),
	content: z.string().max(100000),
	synthesizedInput: z.string().nullable().optional(),
	legalAnalysis: z.string().nullable().optional(),
	ragResults: z.string().nullable().optional(),
	confidence: z.string().nullable().optional(),
	processingTime: z.string().nullable().optional(),
	aiMetadata: z.record(z.string(), z.unknown()).nullable().optional()
});

/** POST /api/v1/chat/messages — Save a chat message to a session */
export const POST: RequestHandler = async ({ request }) => {
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
			userId: 'system',
			role,
			content,
			metadata: JSON.stringify({
				confidence: confidence ?? null,
				processingTime: processingTime ?? null,
				...(aiMetadata ?? {})
			})
		});

		// Update session timestamp
		await db
			.update(chatMetadata)
			.set({ updatedAt: new Date(), lastMessageAt: new Date() })
			.where(eq(chatMetadata.chatId, sessionId));

		return json({ success: true, messageId: msgId }, { status: 201 });
	} catch (err) {
		console.error('[/api/v1/chat/messages] POST error:', err);
		return json({ error: 'Failed to save message' }, { status: 500 });
	}
};