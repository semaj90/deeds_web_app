import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AgenticDiagnosticService } from '$lib/server/ai/agentic-diagnostic';
import { CodeRepairAgent } from '$lib/server/ai/code-repair-agent';
import { ENV } from '$lib/server/env.server.js';

import { z } from 'zod';

const repairSchema = z.object({
	errorId: z.string().min(1)
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { errorId } = repairSchema.parse(body);

		// 1. Diagnose
		const diagnosis = await AgenticDiagnosticService.diagnose(errorId);

		// 2. Propose Fix
		const proposal = await CodeRepairAgent.proposeFix(diagnosis);

		return json({ diagnosis, proposal });
	} catch (err: any) {
		console.error('[Repair API] Error:', err);
		return json({ error: err.message }, { status: 500 });
	}
};
