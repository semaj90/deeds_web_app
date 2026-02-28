import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// In-memory store for demo (shared with parent +server.ts)
// In production, this would be a database query
const collections = new Map();

/**
 * GET /api/citations/collections/[collectionId]
 * Fetch a specific collection by ID
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const { collectionId } = params;

	try {
		const collection = collections.get(collectionId);

		if (!collection) {
			throw error(404, 'Collection not found');
		}

		return json(collection);
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
 * Delete a collection
 */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const { collectionId } = params;

	try {
		const collection = collections.get(collectionId);

		if (!collection) {
			throw error(404, 'Collection not found');
		}

		collections.delete(collectionId);

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
 * Body: { name?: string, color?: string, isPublic?: boolean }
 */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const { collectionId } = params;

	try {
		const collection = collections.get(collectionId);

		if (!collection) {
			throw error(404, 'Collection not found');
		}

		const body = await request.json();

		const updatedCollection = {
			...collection,
			...body,
			id: collectionId, // Prevent ID change
			updatedAt: new Date().toISOString(),
		};

		collections.set(collectionId, updatedCollection);

		return json(updatedCollection);
	} catch (err) {
		console.error('Error updating collection:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to update collection');
	}
};
