import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { chatMessages, chatMetadata } from '$lib/server/db/schema.js';
import { eq, desc, ilike, and } from 'drizzle-orm';

const searchSchema = z.object({
	query: z.string().min(1).max(5000),
	userId: z.string().min(1).optional(),
	caseId: z.string().uuid().nullable().optional(),
	limit: z.number().min(1).max(50).default(5)
});

/** POST /api/v1/chat/search — Search chat messages by content */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const raw = await request.json();
		const parsed = searchSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const { query, userId, caseId, limit } = parsed.data;

		// Search messages by content (ilike for case-insensitive partial match)
		const conditions = [ilike(chatMessages.content, `%${query}%`)];
		if (userId) {
				conditions.push(eq(chatMessages.userId, Number(userId)));
		}

		const results = await db
			.select({
				id: chatMessages.id,
				chatId: chatMessages.chatId,
				role: chatMessages.role,
				content: chatMessages.content,
				createdAt: chatMessages.createdAt
			})
			.from(chatMessages)
			.where(and(...conditions))
			.orderBy(desc(chatMessages.createdAt))
			.limit(limit);

		return json(results);
	} catch (err) {
		console.error('[/api/v1/chat/search] POST error:', err);
		return json([], { status: 500 });
	}
};
