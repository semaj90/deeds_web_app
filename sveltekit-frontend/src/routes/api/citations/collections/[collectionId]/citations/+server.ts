import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { citationCollections, collectionCitations, citations } from '$lib/server/db/schema-postgres.js';
import { eq, and, sql } from 'drizzle-orm';
import { z } from 'zod';

const collectionCitationSchema = z.object({
	citationId: z.string().min(1, 'Missing required field: citationId').max(500),
});

/**
 * POST /api/citations/collections/[collectionId]/citations
 * Add a citation to a collection
 * Body: { citationId: string }
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const { collectionId } = params;

	try {
		const parsed = collectionCitationSchema.safeParse(await request.json());
		if (!parsed.success) {
			throw error(400, parsed.error.issues[0]?.message ?? 'Invalid input');
		}

		// Verify collection exists and belongs to user
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

		// Verify citation exists
		const [citation] = await db
			.select()
			.from(citations)
			.where(eq(citations.id, parsed.data.citationId))
			.limit(1);

		if (!citation) {
			throw error(404, 'Citation not found');
		}

		// Insert into junction table (on conflict do nothing - idempotent)
		await db
			.insert(collectionCitations)
			.values({
				collectionId,
				citationId: parsed.data.citationId,
			})
			.onConflictDoNothing();

		// Get updated citation count
		const [count] = await db
			.select({ count: sql<number>`CAST(COUNT(*) AS INTEGER)` })
			.from(collectionCitations)
			.where(eq(collectionCitations.collectionId, collectionId));

		return json(
			{
				success: true,
				message: 'Citation added to collection',
				collectionId,
				citationId: parsed.data.citationId,
				totalCitations: count?.count || 0,
			},
			{ status: 201 }
		);
	} catch (err) {
		console.error('Error adding citation to collection:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to add citation to collection');
	}
};

/**
 * DELETE /api/citations/collections/[collectionId]/citations
 * Remove a citation from a collection
 * Body: { citationId: string }
 */
export const DELETE: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const { collectionId } = params;

	try {
		const delParsed = collectionCitationSchema.safeParse(await request.json());
		if (!delParsed.success) {
			throw error(400, delParsed.error.issues[0]?.message ?? 'Invalid input');
		}

		// Verify collection exists and belongs to user
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

		// Delete from junction table
		await db
			.delete(collectionCitations)
			.where(
				and(
					eq(collectionCitations.collectionId, collectionId),
					eq(collectionCitations.citationId, delParsed.data.citationId)
				)
			);

		// Get updated citation count
		const [count] = await db
			.select({ count: sql<number>`CAST(COUNT(*) AS INTEGER)` })
			.from(collectionCitations)
			.where(eq(collectionCitations.collectionId, collectionId));

		return json({
			success: true,
			message: 'Citation removed from collection',
			collectionId,
			citationId: delParsed.data.citationId,
			totalCitations: count?.count || 0,
		});
	} catch (err) {
		console.error('Error removing citation from collection:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to remove citation from collection');
	}
};

/**
 * GET /api/citations/collections/[collectionId]/citations
 * Get all citations in a collection
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const { collectionId } = params;

	try {
		// Verify collection exists and belongs to user
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

		// Fetch citations with details
		// NOTE: citations Drizzle schema has column name mismatches vs actual DB
		// Use Drizzle for joins + sql`` for actual DB column names
		const citationsList = await db
			.select({
				citationId: citations.id,
				pageNumber: citations.pageNumber,
				createdAt: citations.createdAt,
				addedAt: collectionCitations.addedAt,
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
			collectionId,
			citations: citationsList,
			totalCitations: citationsList.length,
		});
	} catch (err) {
		console.error('Error fetching collection citations:', err);
		throw error(500, 'Failed to fetch collection citations');
	}
};
