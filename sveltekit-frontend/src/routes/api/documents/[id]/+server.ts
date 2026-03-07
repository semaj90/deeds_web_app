import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { documents } from '$lib/server/db/schema-postgres.js';
import { eq, sql } from 'drizzle-orm';

/**
 * GET /api/documents/[id]
 * Fetch a single document by ID
 */
export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;

	try {
		const [doc] = await db
			.select()
			.from(documents)
			.where(eq(documents.id, id))
			.limit(1);

		if (!doc) {
			return json({ error: 'Document not found' }, { status: 404 });
		}

		return json({
			id: doc.id,
			title: doc.title,
			content: doc.content ?? '',
			type: doc.fileType ?? 'document',
			status: doc.status ?? 'draft',
			summary: doc.summary,
			metadata: doc.metadata,
			citations: (doc.metadata as any)?.citations ?? [],
			createdAt: doc.createdAt,
			updatedAt: doc.updatedAt,
		});
	} catch (err) {
		console.error('[documents] GET error:', err);
		return json({ error: 'Failed to fetch document' }, { status: 500 });
	}
};

/**
 * PUT /api/documents/[id]
 * Update document content and status
 */
export const PUT: RequestHandler = async ({ params, request }) => {
	const { id } = params;

	try {
		const body = await request.json();
		const { content, status } = body;

		await db
			.update(documents)
			.set({
				...(content !== undefined ? { content } : {}),
				...(status !== undefined ? { status } : {}),
				updatedAt: new Date(),
			})
			.where(eq(documents.id, id));

		return json({ success: true, updatedAt: new Date().toISOString() });
	} catch (err) {
		console.error('[documents] PUT error:', err);
		return json({ error: 'Failed to update document' }, { status: 500 });
	}
};