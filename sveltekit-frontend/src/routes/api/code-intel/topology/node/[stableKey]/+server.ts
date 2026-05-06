import { json } from '@sveltejs/kit';
import { getTopologyNode } from '$lib/server/ai/code-intel-service.js';

export async function GET({ params, locals }) {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	const node = await getTopologyNode(params.stableKey);
	if (!node) return json({ error: 'Node not found' }, { status: 404 });
	return json(node);
}
