/**
 * GET /api/tags/:tagId — Tag detail from CouchDB catalog
 */
import { json, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params }) => {
	const { tagId } = params;

	if (!tagId) {
		return json({ error: 'tagId required' }, { status: 400 });
	}

	try {
		const { couchdb } = await import('$lib/services/couchdb-client.js');
		const doc = await couchdb.get('ace_tags', tagId);
		return json(doc);
	} catch (err) {
		return json(
			{ error: 'Tag not found', message: err instanceof Error ? err.message : String(err) },
			{ status: 404 }
		);
	}
};
