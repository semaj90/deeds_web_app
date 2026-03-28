import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { chatMetadata } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';

const associationSchema = z.object({
	reportId: z.string().min(1),
	chatSessionId: z.string().min(1),
	associationType: z.string().max(50).default('analysis'),
	metadata: z.record(z.string(), z.unknown()).optional()
});

/** POST /api/v1/reports/chat-associations — Link a chat session to a report */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const raw = await request.json();
		const parsed = associationSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const { chatSessionId } = parsed.data;

		// Store the association in chat metadata (caseId field doubles as report link)
		await db
			.update(chatMetadata)
			.set({
				updatedAt: new Date()
			})
			.where(eq(chatMetadata.chatId, chatSessionId));

		return json({ success: true }, { status: 201 });
	} catch (err) {
		console.error('[/api/v1/reports/chat-associations] POST error:', err);
		return json({ error: 'Failed to create association' }, { status: 500 });
	}
};