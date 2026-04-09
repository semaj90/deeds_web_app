/**
 * POST /api/audit/planner — Gemma 4 agentic audit planner
 *
 * Send a natural language query about the codebase. Gemma 4 selects and runs
 * the appropriate audit tools (GPU audit, graph analysis, codebase search),
 * then synthesizes a readable understanding report.
 *
 * Body: {
 *   query: string,        — "What are the most critical files?" / "Find duplicate code" / "Run full audit"
 *   caseId?: string,      — optional case UUID to scope analysis
 *   history?: Array<{ role: string, content: string }>  — conversation context
 * }
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { runAuditPlanner } from '$lib/server/audit/gemma-tool-router.js';

const plannerSchema = z.object({
	query: z.string().trim().min(1, 'Query required').max(2000),
	caseId: z.string().uuid().optional(),
	history: z.array(z.object({
		role: z.string(),
		content: z.string(),
	})).max(20).optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		body = {};
	}

	const parsed = plannerSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	try {
		const result = await runAuditPlanner({
			query: parsed.data.query,
			caseId: parsed.data.caseId,
			conversationHistory: parsed.data.history,
		});

		return json({
			success: true,
			response: result.response,
			toolsExecuted: result.toolResults.map((tr) => ({
				tool: tr.tool,
				ok: tr.ok,
				durationMs: tr.durationMs,
			})),
			totalDurationMs: result.totalDurationMs,
		});
	} catch (err) {
		console.error('[/api/audit/planner] Failed:', (err as Error)?.message);
		return json({ error: 'Audit planner failed' }, { status: 500 });
	}
};

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	return json({
		description: 'Gemma 4 agentic audit planner — ask questions about your codebase',
		examples: [
			'What are the most critical files in this codebase?',
			'Find near-duplicate code above 90% similarity',
			'Run a full GPU audit and explain the results',
			'What subsystem communities exist?',
			'Check GPU status and recommend audit parameters',
			'Show me the latest audit report',
		],
		tools: ['run_gpu_audit', 'analyze_graph', 'search_codebase', 'get_audit_report', 'gpu_status'],
	});
};
