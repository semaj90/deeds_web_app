import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { citationCollections, collectionCitations, citations } from '$lib/server/db/schema-postgres.js';
import { eq, and, sql } from 'drizzle-orm';
import { z } from 'zod';
import { isUuid } from '$lib/server/validation.js';

const updateCollectionSchema = z.object({
	name: z.string().trim().max(500).optional(),
	description: z.string().max(5000).optional(),
	color: z.string().max(20).optional(),
	isPublic: z.boolean().optional(),
});

/**
 * GET /api/citations/collections/[collectionId]
 * Fetch a specific collection by ID with its citations
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}
	if (!isUuid(params.collectionId)) return json({ error: 'Invalid ID format' }, { status: 400 });

	const { collectionId } = params;

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
	// NOTE: citations Drizzle schema has column name mismatches vs actual DB
	// (citationText→quoted_text, sourceUrl→N/A, confidence→relevance_score)
	// Use Drizzle for type-safe joins + sql`` for actual DB column names
	const collectionCitationsList = await db
		.select({
			id: citations.id,
			caseId: citations.caseId,
			documentId: citations.documentId,
			pageNumber: citations.pageNumber,
			createdAt: citations.createdAt,
			addedAt: collectionCitations.addedAt,
			// Map to actual DB column names (not Drizzle schema names)
			quotedText: sql<string>`"citations"."quoted_text"`,
			citationType: sql<string>`"citations"."citation_type"`,
			relevanceScore: sql<number>`"citations"."relevance_score"`,
			formattedCitation: sql<string>`"citations"."formatted_citation"`,
			isKeyAuthority: sql<boolean>`"citations"."is_key_authority"`,
		})
		.from(collectionCitations)
		.innerJoin(citations, eq(collectionCitations.citationId, citations.id))
		.where(eq(collectionCitations.collectionId, collectionId))
		.orderBy(collectionCitations.addedAt);

	return json({
		...collection,
		citations: collectionCitationsList,
	});
};

/**
 * DELETE /api/citations/collections/[collectionId]
 * Delete a collection (cascade deletes collection_citations automatically)
 */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}
	if (!isUuid(params.collectionId)) return json({ error: 'Invalid ID format' }, { status: 400 });

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
	if (!isUuid(params.collectionId)) return json({ error: 'Invalid ID format' }, { status: 400 });

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

		const parsed = updateCollectionSchema.safeParse(await request.json());
		if (!parsed.success) {
			throw error(400, parsed.error.issues[0]?.message ?? 'Invalid input');
		}
		const body = parsed.data;

		// Build update object (only update provided fields)
		const updates: any = {};
		if (body.name !== undefined) updates.name = body.name;
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
