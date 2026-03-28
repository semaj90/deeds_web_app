/**
 * GET /api/ai/personas
 *
 * Returns available LLM personas for the style adaptation system.
 */
import { json } from '@sveltejs/kit';
import { getPersonas } from '$lib/server/ace/style-adapter.js';

export async function GET({ locals }) {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	return json({ personas: getPersonas() });
}
