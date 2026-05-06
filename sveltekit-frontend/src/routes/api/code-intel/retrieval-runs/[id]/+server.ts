import { json } from '@sveltejs/kit';
import { getRetrievalRunDetail } from '$lib/server/ai/code-intel-service.js';

export async function GET({ params, locals }) {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	const detail = await getRetrievalRunDetail(params.id);
	if (!detail) return json({ error: 'Run not found' }, { status: 404 });
	return json(detail);
}
