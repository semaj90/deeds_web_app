/**
 * LLM Self-Improvement API - Escalation Endpoint
 * Phase 72 - Task 14: Integration API Endpoints
 *
 * POST /api/llm-improvement/escalate
 * Creates an escalation ticket for human review
 */

import { getEscalationService } from '$lib/services/error-analysis/EscalationService';
import type {
    DiagnosticResult,
    ErrorContext,
    ErrorReport,
    FixStrategy
} from '$lib/services/error-analysis/types';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { error, attemptedStrategies, confidence, toolResults, context } = body as {
			error: ErrorReport, attemptedStrategies: FixStrategy[], confidence: number, toolResults: DiagnosticResult[], context: ErrorContext;
		};

		if (!error) {
			return json({ error: 'Missing error report' }, { status: 400 });
		}

		const escalation = getEscalationService();

		const result = await escalation.createEscalation(
			error,
			attemptedStrategies || [],
			confidence || 0,
			toolResults || [],
			context || { text: error.message, fileContent: '' }
		);

		return json({
			success: result.success,
			ticketId: result.ticketId,
			error: result.error
		});
	} catch (err) {
		console.error('Escalation failed:', err);
		return json(
			{ error: err instanceof Error ? err.message : 'Escalation failed' },
			{ status: 500 }
		);
	}
};

/**
 * GET /api/llm-improvement/escalate
 * Get escalation tickets and statistics
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const escalation = getEscalationService();
		const status = url.searchParams.get('status');

		let tickets;
		if (status === 'open') {
			tickets = escalation.getOpenTickets();
		} else if (status) {
			tickets = escalation.getTicketsByStatus(status as any);
		} else {
			tickets = escalation.getOpenTickets();
		}

		return json({
			success: true,
			tickets: tickets.map(t => ({
				id: t.id,
				error: {
					code: t.errorReport.code,
					message: t.errorReport.message,
					file: t.errorReport.file
				},
				confidence: t.confidence,
				status: t.status,
				assignedTo: t.assignedTo,
				createdAt: t.createdAt
			}, stats: escalation.getStats(, analysis: escalation.analyzeEscalationPatterns()
		});
	} catch (err) {
		return json(
			{ error: err instanceof Error ? err.message : 'Failed to get tickets' },
			{ status: 500 }
		);
	}
};

/**
 * PUT /api/llm-improvement/escalate
 * Update escalation ticket (resolve, assign, close)
 */
export const PUT: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { ticketId, action, fix, resolution, assignee } = body as {
			ticketId: string, action: 'resolve' | 'assign' | 'close';
			fix?: FixStrategy;
			resolution?: string;
			assignee?: string;
		};

		if (!ticketId || !action) {
			return json({ error: 'Missing ticketId or action' }, { status: 400 });
		}

		const escalation = getEscalationService();

		switch (action) {
			case 'resolve':
				if (!fix || !resolution) {
					return json({ error: 'Missing fix or resolution' }, { status: 400 });
				}
				const resolveResult = await escalation.recordHumanFix(ticketId, fix, resolution);
				return json({
					success: resolveResult.success,
					experienceId: resolveResult.experienceId,
					policyUpdated: resolveResult.policyUpdated,
					error: resolveResult.error
				});

			case 'assign':
				if (!assignee) {
					return json({ error: 'Missing assignee' }, { status: 400 });
				}
				const assigned = escalation.assignTicket(ticketId, assignee);
				return json({ success: assigned });

			case 'close':
				const closed = escalation.closeTicket(ticketId, resolution || 'Closed without resolution');
				return json({ success: closed });

			default:
				return json({ error: 'Invalid action' }, { status: 400 });
		}
	} catch (err) {
		return json(
			{ error: err instanceof Error ? err.message : 'Update failed' },
			{ status: 500 }
		);
	}
};
