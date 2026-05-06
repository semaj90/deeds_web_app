import { json } from '@sveltejs/kit';
import { getResearchProvenance } from '$lib/server/ai/code-intel-service.js';

export async function GET({ params, locals }) {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	const provenance = await getResearchProvenance(params.id);
	if (!provenance) return json({ error: 'Research provenance not found' }, { status: 404 });
	return json(provenance);
}
