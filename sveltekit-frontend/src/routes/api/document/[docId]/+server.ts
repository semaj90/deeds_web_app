import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const { docId } = params;

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
		return json({ error: 'Database unavailable' }, { status: 500 });
	}
};
