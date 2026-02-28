import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// In-memory store for demo
// Maps collectionId -> Set<citationId>
const collectionCitations = new Map<string, Set<string>>();

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
		const body = await request.json();

		if (!body?.citationId) {
			throw error(400, 'Missing required field: citationId');
		}

		// Get or create citation set for this collection
		if (!collectionCitations.has(collectionId)) {
			collectionCitations.set(collectionId, new Set());
		}

		const citationSet = collectionCitations.get(collectionId)!;
		citationSet.add(body.citationId);

		return json({
			success: true,
			message: 'Citation added to collection',
			collectionId,
			citationId: body.citationId,
			totalCitations: citationSet.size,
		}, { status: 201 });
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
		const body = await request.json();

		if (!body?.citationId) {
			throw error(400, 'Missing required field: citationId');
		}

		const citationSet = collectionCitations.get(collectionId);

		if (!citationSet || !citationSet.has(body.citationId)) {
			throw error(404, 'Citation not found in collection');
		}

		citationSet.delete(body.citationId);

		return json({
			success: true,
			message: 'Citation removed from collection',
			collectionId,
			citationId: body.citationId,
			totalCitations: citationSet.size,
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
		const citationSet = collectionCitations.get(collectionId) || new Set();

		return json({
			collectionId,
			citationIds: Array.from(citationSet),
			totalCitations: citationSet.size,
		});
	} catch (err) {
		console.error('Error fetching collection citations:', err);
		throw error(500, 'Failed to fetch collection citations');
	}
};
