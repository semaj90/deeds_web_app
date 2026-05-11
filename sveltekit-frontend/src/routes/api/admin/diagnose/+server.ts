import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AgenticDiagnosticService } from '$lib/server/ai/agentic-diagnostic';
import { ENV } from '$lib/server/env.server.js';

import { z } from 'zod';

const diagnoseSchema = z.object({
	errorId: z.string().min(1)
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { errorId } = diagnoseSchema.parse(body);

		const diagnosis = await AgenticDiagnosticService.diagnose(errorId);

		return json({ diagnosis });
	} catch (err: any) {
		console.error('[Diagnostic API] Error:', err);
		return json({ error: err.message }, { status: 500 });
	}
};
