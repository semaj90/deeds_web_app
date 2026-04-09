import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { documents } from '$lib/server/db/schema.js';
import { desc } from 'drizzle-orm';

const querySchema = z.object({
	limit: z.coerce.number().int().min(1).max(200).default(50)
});

/** GET /api/rag/documents — List RAG-indexed documents */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
		const limit = parsed.success ? parsed.data.limit : 50;

		const rows = await db
			.select({
				id: documents.id,
				title: documents.title,
				fileType: documents.fileType,
				status: documents.status,
				createdAt: documents.createdAt,
				updatedAt: documents.updatedAt
			})
			.from(documents)
			.orderBy(desc(documents.createdAt))
			.limit(limit);

		return json(rows);
	} catch (err) {
		console.error('[/api/rag/documents] error:', err);
		return json([]);
	}
};