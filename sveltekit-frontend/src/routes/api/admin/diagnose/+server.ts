import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AgenticDiagnosticService } from '$lib/server/ai/agentic-diagnostic';
import { ENV } from '$lib/server/env.server.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user && !ENV.DEV_BYPASS_AUTH) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { errorId } = await request.json();
		if (!errorId) return json({ error: 'errorId required' }, { status: 400 });

		const diagnosis = await AgenticDiagnosticService.diagnose(errorId);

		return json({ diagnosis });
	} catch (err: any) {
		console.error('[Diagnostic API] Error:', err);
		return json({ error: err.message }, { status: 500 });
	}
};
