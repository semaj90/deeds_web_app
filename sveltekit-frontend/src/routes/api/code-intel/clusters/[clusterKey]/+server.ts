import { json } from '@sveltejs/kit';
import { getClusterDetails } from '$lib/server/ai/code-intel-service.js';

export async function GET({ params, locals }) {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	const details = await getClusterDetails(params.clusterKey);
	if (!details) return json({ error: 'Cluster not found' }, { status: 404 });
	return json(details);
}
