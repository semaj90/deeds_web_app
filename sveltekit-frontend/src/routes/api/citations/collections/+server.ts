import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { citationCollections, collectionCitations, citations } from '$lib/server/db/schema-postgres.js';
import { eq, and, sql } from 'drizzle-orm';

/**
 * GET /api/citations/collections
 * Fetch all citation collections for the current user
 */
export const GET: RequestHandler = async ({ locals }) => {
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

		return json(userCollections);
	} catch (err) {
		console.error('Error fetching collections:', err);
		return json([], { status: 200 });
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
		const body = await request.json();

		if (!body?.name?.trim()) {
			throw error(400, 'Missing required field: name');
		}

		const [newCollection] = await db
			.insert(citationCollections)
			.values({
				userId: locals.user.id,
				name: body.name.trim(),
				description: body.description?.trim() || null,
				color: body.color || '#8B2332',
				isPublic: body.isPublic ?? false,
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
