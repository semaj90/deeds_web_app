import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { LegalStrategyAgent } from '$lib/server/ai/legal-strategy-agent';
import { ENV } from '$lib/server/env.server.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user && !ENV.DEV_BYPASS_AUTH) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { query } = await request.json();
		if (!query) return json({ error: 'query required' }, { status: 400 });

		const strategy = await LegalStrategyAgent.generateStrategy(query);

		return json({ strategy });
	} catch (err: any) {
		console.error('[Legal Strategy API] Error:', err);
		return json({ error: err.message }, { status: 500 });
	}
};
