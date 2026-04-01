import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { documents } from '$lib/server/db/schema.js';
import { gt } from 'drizzle-orm';

const syncSchema = z.object({
	lastSyncTime: z.number().min(0),
	pendingChanges: z.array(z.record(z.string(), z.unknown())).default([])
});

/** POST /api/sync/documents — Sync local document cache with server */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const raw = await request.json();
		const parsed = syncSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const { lastSyncTime } = parsed.data;
		const sinceDate = new Date(lastSyncTime);

		const updatedDocs = await db
			.select({
				title: documents.title,
				content: documents.content,
				fileType: documents.fileType,
				status: documents.status
			})
			.from(documents)
			.where(gt(documents.updatedAt, sinceDate))
			.limit(200);

		return json({
			documents: updatedDocs,
			deletedIds: [],
			syncTimestamp: Date.now()
		});
	} catch (err) {
		console.error('[/api/sync/documents] error:', err);
		return json({ documents: [], deletedIds: [], syncTimestamp: Date.now() });
	}
};