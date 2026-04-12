/**
 * GET /api/ai/personas
 *
 * Returns available LLM personas for the style adaptation system.
 */
import { json } from '@sveltejs/kit';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';
import { getPersonas } from '$lib/server/ace/style-adapter.js';

export async function GET({ locals, request }) {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const responseData = { personas: getPersonas() };

	const { etag, isMatch } = checkETag(responseData, request.headers);
	if (isMatch) return notModified(etag);

	return json(responseData, {
		headers: { ...cacheControl.long, ETag: etag }
	});
}
