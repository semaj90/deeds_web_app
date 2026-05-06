import { json } from '@sveltejs/kit';
import { getCodeIntelHealth } from '$lib/server/ai/code-intel-service.js';

export async function GET({ locals }) {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	try {
		const health = await getCodeIntelHealth();
		return json(health);
	} catch (error) {
		console.error('[code-intel-api] Health check failed:', error);
		return json({ error: 'Internal Server Error', status: 'degraded' }, { status: 500 });
	}
}
