/**
 * GET /api/tags/:tagId — Tag detail from CouchDB catalog
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { isValidSafeId } from '$lib/server/validation.js';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const { tagId } = params;

	if (!isValidSafeId(tagId)) {
		return json({ error: 'Invalid tag ID format' }, { status: 400 });
	}

	try {
		const { couchdb } = await import('$lib/services/couchdb-client.js');
		const doc = await couchdb.get('ace_tags', tagId);
		return json(doc);
	} catch (err) {
		return json(
			{ error: 'Tag not found' },
			{ status: 404 }
		);
	}
};
