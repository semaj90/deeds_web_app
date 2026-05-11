import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { LegalStrategyAgent } from '$lib/server/ai/legal-strategy-agent';
import { ENV } from '$lib/server/env.server.js';

import { z } from 'zod';

const strategySchema = z.object({
	query: z.string().min(1)
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { query } = strategySchema.parse(body);

		const strategy = await LegalStrategyAgent.generateStrategy(query);

		return json({ strategy });
	} catch (err: any) {
		console.error('[Legal Strategy API] Error:', err);
		return json({ error: err.message }, { status: 500 });
	}
};
