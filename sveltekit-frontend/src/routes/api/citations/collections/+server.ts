import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { citationCollections, collectionCitations, citations } from '$lib/server/db/schema-postgres.js';
import { eq, and, sql } from 'drizzle-orm';
import { z } from 'zod';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';

const createCollectionSchema = z.object({
	name: z.string().trim().min(1, 'Missing required field: name').max(500),
	description: z.string().max(5000).nullable().optional(),
	color: z.string().max(20).optional().default('#8B2332'),
	isPublic: z.boolean().optional().default(false)
});

/**
 * GET /api/citations/collections
 * Fetch all citation collections for the current user
 */
export const GET: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		// Fetch user's collections with citation counts
		const userCollections = await db
			.select({
				id: citationCollections.id,
				userId: citationCollections.userId,
				name: citationCollections.name,
				description: citationCollections.description,
				color: citationCollections.color,
				isPublic: citationCollections.isPublic,
				createdAt: citationCollections.createdAt,
				updatedAt: citationCollections.updatedAt,
				citationCount: sql<number>`CAST(COUNT(${collectionCitations.citationId}) AS INTEGER)`,
			})
			.from(citationCollections)
			.leftJoin(collectionCitations, eq(collectionCitations.collectionId, citationCollections.id))
			.where(eq(citationCollections.userId, locals.user.id))
			.groupBy(citationCollections.id)
			.orderBy(citationCollections.createdAt);

		const { etag, isMatch } = checkETag(userCollections, request.headers);
		if (isMatch) return notModified(etag);

		return json(userCollections, {
			headers: { ...cacheControl.private, ETag: etag }
		});
	} catch (err) {
		console.error('Error fetching collections:', err);
		return json([], {
			status: 200,
			headers: cacheControl.private
		});
	}
};

/**
 * POST /api/citations/collections
 * Create a new citation collection
 * Body: { name: string, description?: string, color?: string, isPublic?: boolean }
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		// Zod validates name (required, trimmed), description, color default, isPublic default
		const parsed = createCollectionSchema.safeParse(await request.json());
		if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });

		const [newCollection] = await db
			.insert(citationCollections)
			.values({
				userId: locals.user.id,
				name: parsed.data.name,
				description: parsed.data.description ?? null,
				color: parsed.data.color,
				isPublic: parsed.data.isPublic,
			})
			.returning();

		// Return with citationCount = 0 (new collection has no citations)
		return json({ ...newCollection, citationCount: 0 }, { status: 201 });
	} catch (err) {
		console.error('Error creating collection:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to create collection');
	}
};
