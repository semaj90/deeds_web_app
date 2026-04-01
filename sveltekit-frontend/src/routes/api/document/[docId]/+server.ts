import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isUuid } from '$lib/server/validation.js';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const { docId } = params;

	if (!isUuid(docId)) {
		return json({ error: 'Invalid ID format' }, { status: 400 });
	}

	try {
		const [doc] = await db
			.select()
			.from(evidence)
			.where(eq(evidence.id, docId))
			.limit(1);

		if (!doc) {
			return json({ error: 'Document not found' }, { status: 404 });
		}

		return json({ document: doc });
	} catch {
		return json({ document: null });
	}
};
