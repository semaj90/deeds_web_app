import { json } from '@sveltejs/kit';
import { checkSystemHealth } from '$lib/server/ai/code-intel-service.js';

export async function POST({ locals }) {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	const health = await checkSystemHealth();
	return json(health);
}
