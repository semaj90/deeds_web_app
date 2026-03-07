import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { documents } from '$lib/server/db/schema-postgres.js';
import { eq } from 'drizzle-orm';

/**
 * POST /api/documents/[id]/auto-save
 * Auto-save document content (debounced by client)
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const { id } = params;

	try {
		const body = await request.json();
		const { content } = body;

		if (content === undefined) {
			return json({ error: 'No content provided' }, { status: 400 });
		}

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