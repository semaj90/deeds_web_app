import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { generateClaudePlan } from '$lib/server/ai/code-intel-service.js';

const ClaudePlanSchema = z.object({
	goal: z.string().min(1).max(2000),
	scope: z.string().max(500).optional()
});

export async function POST({ request, locals }) {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	try {
		const parsed = ClaudePlanSchema.safeParse(await request.json());
		if (!parsed.success) return json({ error: parsed.error.flatten() }, { status: 400 });
		const { goal, scope } = parsed.data;
		const plan = await generateClaudePlan({ goal, scope });
		return json(plan);
	} catch (error) {
		console.error('[claude-plan-api] Plan generation failed:', error);
		return json({ error: 'Internal Server Error' }, { status: 500 });
	}
}
