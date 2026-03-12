import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { documents } from '$lib/server/db/schema-postgres.js';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const autoSaveSchema = z.object({
	content: z.string().max(5_000_000),
});

/**
 * POST /api/documents/[id]/auto-save
 * Auto-save document content (debounced by client)
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const { id } = params;

	try {
		const parsed = autoSaveSchema.safeParse(await request.json());
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const { content } = parsed.data;

		await db
			.update(documents)
			.set({
				content,
				updatedAt: new Date(),
			})
			.where(eq(documents.id, id));

		return json({ success: true, savedAt: new Date().toISOString() });
	} catch (err) {
		console.error('[documents/auto-save] Error:', err);
		return json({ error: 'Auto-save failed', success: false }, { status: 500 });
	}
};