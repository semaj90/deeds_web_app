import { json } from '@sveltejs/kit';
import { runTraceSubagentDag } from '$lib/server/agents/trace-subagent-orchestrator.js';

/**
 * POST /api/trace/subagents/run
 * 
 * Triggers a full TRACE subagent DAG run.
 */
export async function POST({ request, locals }) {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	try {
		const body = await request.json();
		const { query, filePaths } = body;

		const result = await runTraceSubagentDag({
			runId: `trace-subagents-${new Date().toISOString().split('T')[0]}-${crypto.randomUUID().slice(0, 8)}`,
			query: query || 'Analyze codebase topology and research links',
			filePaths: filePaths || []
		});

		return json(result);
	} catch (error) {
		console.error('[subagents-api] Run failed:', error);
		return json({ error: 'Internal Server Error' }, { status: 500 });
	}
}
