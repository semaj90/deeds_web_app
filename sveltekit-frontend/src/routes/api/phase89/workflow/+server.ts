import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadDailyGraphifyBoard } from '$lib/server/atlas/board/daily-graphify-board.js';
import {
	buildPhase89WorkflowPlan,
	recordPhase89WorkflowPlan,
	Phase89WorkflowRequestSchema,
} from '$lib/server/atlas/board/phase89-workflow.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	try {
		const raw = await request.json();
		const parsed = Phase89WorkflowRequestSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const board = await loadDailyGraphifyBoard();
		const plan = buildPhase89WorkflowPlan(board, parsed.data);

		if (!parsed.data.dryRun) {
			await recordPhase89WorkflowPlan(plan);
		}

		return json({
			success: true,
			kind: parsed.data.dryRun ? 'plan' : 'result',
			plan,
			result: parsed.data.dryRun
				? null
				: {
						workflowId: plan.workflowId,
						queuedRoutes: plan.validationRoutes,
				  },
		});
	} catch (error) {
		console.error('[/api/phase89/workflow] error:', error);
		return json({ success: false, error: 'Failed to start workflow' }, { status: 500 });
	}
};
