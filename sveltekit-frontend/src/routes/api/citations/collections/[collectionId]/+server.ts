import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { citationCollections, collectionCitations, citations } from '$lib/server/db/schema-postgres.js';
import { eq, and, sql } from 'drizzle-orm';

/**
 * GET /api/citations/collections/[collectionId]
 * Fetch a specific collection by ID with its citations
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const { collectionId } = params;

	try {
		// Fetch collection with citation count
		const [collection] = await db
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
			.where(
				and(
					eq(citationCollections.id, collectionId),
					eq(citationCollections.userId, locals.user.id)
				)
			)
			.groupBy(citationCollections.id)
			.limit(1);

		if (!collection) {
			throw error(404, 'Collection not found');
		}

		// Fetch citations in this collection
		const collectionCitationsList = await db
			.select({
				citationId: citations.id,
				citationText: citations.citationText,
				sourceUrl: citations.sourceUrl,
				pageNumber: citations.pageNumber,
				confidence: citations.confidence,
				createdAt: citations.createdAt,
				addedAt: collectionCitations.addedAt,
			})
			.from(collectionCitations)
			.innerJoin(citations, eq(collectionCitations.citationId, citations.id))
			.where(eq(collectionCitations.collectionId, collectionId))
			.orderBy(collectionCitations.addedAt);

		return json({
			...collection,
			citations: collectionCitationsList,
		});
	} catch (err) {
		console.error('Error fetching collection:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to fetch collection');
	}
};

/**
 * DELETE /api/citations/collections/[collectionId]
 * Delete a collection (cascade deletes collection_citations automatically)
 */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const { collectionId } = params;

	try {
		// Verify ownership before deleting
		const [collection] = await db
			.select()
			.from(citationCollections)
			.where(
				and(
					eq(citationCollections.id, collectionId),
					eq(citationCollections.userId, locals.user.id)
				)
			)
			.limit(1);

		if (!collection) {
			throw error(404, 'Collection not found');
		}

		// Delete collection (cascade handles collection_citations)
		await db.delete(citationCollections).where(eq(citationCollections.id, collectionId));

		return json({ success: true, message: 'Collection deleted' });
	} catch (err) {
		console.error('Error deleting collection:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to delete collection');
	}
};

/**
 * PATCH /api/citations/collections/[collectionId]
 * Update a collection
 * Body: { name?: string, description?: string, color?: string, isPublic?: boolean }
 */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const { collectionId } = params;

	try {
		// Verify ownership before updating
		const [collection] = await db
			.select()
			.from(citationCollections)
			.where(
				and(
					eq(citationCollections.id, collectionId),
					eq(citationCollections.userId, locals.user.id)
				)
			)
			.limit(1);

		if (!collection) {
			throw error(404, 'Collection not found');
		}

		const body = await request.json();

		// Build update object (only update provided fields)
		const updates: any = {};
		if (body.name !== undefined) updates.name = body.name.trim();
		if (body.description !== undefined) updates.description = body.description?.trim() || null;
		if (body.color !== undefined) updates.color = body.color;
		if (body.isPublic !== undefined) updates.isPublic = body.isPublic;
		updates.updatedAt = sql`now()`;

		const [updatedCollection] = await db
			.update(citationCollections)
			.set(updates)
			.where(eq(citationCollections.id, collectionId))
			.returning();

		return json(updatedCollection);
	} catch (err) {
		console.error('Error updating collection:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to update collection');
	}
};
