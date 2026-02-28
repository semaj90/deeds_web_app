import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { CitationCollection } from '$lib/types/citations';

// In-memory store for demo (replace with DB in production)
const collections = new Map<string, CitationCollection>();

/**
 * GET /api/citations/collections
 * Fetch all citation collections for the current user
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		const userCollections = Array.from(collections.values());
		return json(userCollections);
	} catch (err) {
		console.error('Error fetching collections:', err);
		return json([], { status: 200 });
	}
};

/**
 * POST /api/citations/collections
 * Create a new citation collection
 * Body: { name: string, color?: string, isPublic?: boolean }
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

		const newCollection: any = {
			id: crypto.randomUUID(),
			userId: locals.user.id,
			name: body.name.trim(),
			color: body.color || '#8B2332',
			isPublic: body.isPublic ?? false,
			citationCount: 0,
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		collections.set(newCollection.id, newCollection);

		return json(newCollection, { status: 201 });
	} catch (err) {
		console.error('Error creating collection:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to create collection');
	}
};
