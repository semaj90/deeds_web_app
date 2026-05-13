import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { chatMetadata } from '$lib/server/db/schema.js';

const createSessionSchema = z.object({
	userId: z.string().min(1),
	caseId: z.string().uuid().nullable().optional(),
	reportId: z.string().uuid().nullable().optional(),
	userRole: z.string().max(100).optional(),
	title: z.string().max(500).optional(),
	sessionMetadata: z.record(z.string(), z.unknown()).optional()
});

/** POST /api/v1/chat/sessions — Create a new chat session */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const raw = await request.json();
		const parsed = createSessionSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const { userId, caseId, reportId, title, sessionMetadata } = parsed.data;
		const chatId = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

		await db.insert(chatMetadata).values({
      chatId,
      userId: Number(userId),
      caseId: caseId ?? null,
      title: title ?? `Chat - ${new Date().toLocaleDateString()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

		return json({
			id: chatId,
			userId,
			caseId: caseId ?? null,
			reportId: reportId ?? null,
			title: title ?? `Chat - ${new Date().toLocaleDateString()}`,
			sessionMetadata: sessionMetadata ?? {},
			createdAt: new Date().toISOString()
		}, { status: 201 });
	} catch (err) {
		console.error('[/api/v1/chat/sessions] POST error:', err);
		return json({ error: 'Failed to create chat session' }, { status: 500 });
	}
};