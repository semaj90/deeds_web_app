import { json } from '@sveltejs/kit';
import { generateClaudePlan } from '$lib/server/ai/code-intel-service.js';

export async function POST({ request, locals }) {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	
	try {
		const body = await request.json();
		const { goal, scope } = body;
		const plan = await generateClaudePlan({ goal, scope });
		return json(plan);
	} catch (error) {
		console.error('[claude-plan-api] Plan generation failed:', error);
		return json({ error: 'Internal Server Error' }, { status: 500 });
	}
}
