import { json } from '@sveltejs/kit';
import { getClusterSummaryLenses } from '$lib/server/ai/code-intel-service.js';

export async function GET({ params, locals }) {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	const lenses = await getClusterSummaryLenses(params.clusterKey);
	return json(lenses);
}
