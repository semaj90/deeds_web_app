/**
 * GET /api/error-brain/escalations   — List escalation tickets
 * POST /api/error-brain/escalations  — Record a human-provided fix
 * PATCH /api/error-brain/escalations — Assign/close/auto-close tickets
 *
 * Human-in-the-loop escalation management from error-analysis services.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { getEscalationService } from '$lib/services/error-analysis/EscalationService.js';
import type { FixStrategy } from '$lib/services/error-analysis/types.js';

const humanFixSchema = z.object({
	ticketId: z.string().min(1).max(500),
	fixedCode: z.string().min(1).max(500000),
	description: z.string().max(10000).optional().default('Human-provided fix'),
	resolution: z.string().max(10000).optional().default('Resolved by human'),
});

const ticketActionSchema = z.object({
	action: z.enum(['assign', 'close', 'auto_close_old', 'patterns']),
	ticketId: z.string().max(500).optional(),
	assignee: z.string().max(200).optional(),
	reason: z.string().max(10000).optional().default('Closed'),
});

export const GET: RequestHandler = async ({ url }) => {
	try {
		const escalation = getEscalationService();
		const status = url.searchParams.get('status') ?? 'open';

		const tickets = status === 'open'
			? escalation.getOpenTickets()
			: escalation.getTicketsByStatus(status as any);

		return json({
			tickets: tickets.slice(0, 50),
			total: tickets.length,
			ts: new Date().toISOString(),
		});
	} catch (e) {
		return json({ tickets: [], total: 0, error: (e as Error).message }, { status: 503 });
	}
};

export const POST: RequestHandler = async ({ request }) => {
	const parsed = humanFixSchema.safeParse(await request.json());
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	try {
		const escalation = getEscalationService();

		const fixStrategy: FixStrategy = {
			id: crypto.randomUUID(),
			description: parsed.data.description,
			code: parsed.data.fixedCode,
			applicablePatterns: [],
			successRate: 1,
			confidence: 1,
			validationRules: [],
			appliedCount: 0,
			lastApplied: new Date(),
			createdAt: new Date(),
		};

		await escalation.recordHumanFix(
			parsed.data.ticketId,
			fixStrategy,
			parsed.data.resolution,
		);

		return json({ recorded: true, ticketId: parsed.data.ticketId }, { status: 201 });
	} catch (e) {
		return json({ error: (e as Error).message }, { status: 500 });
	}
};

export const PATCH: RequestHandler = async ({ request }) => {
	const parsed = ticketActionSchema.safeParse(await request.json());
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const { action, ticketId, assignee, reason } = parsed.data;
	const escalation = getEscalationService();

	try {
		if (action === 'assign' && ticketId && assignee) {
			const ok = escalation.assignTicket(ticketId, assignee);
			return json({ assigned: ok, ticketId, assignee });
		}

		if (action === 'close' && ticketId) {
			const ok = escalation.closeTicket(ticketId, reason);
			return json({ closed: ok, ticketId });
		}

		if (action === 'auto_close_old') {
			const count = escalation.autoCloseOldTickets();
			return json({ autoCloseDone: true, ticketsClosed: count });
		}

		if (action === 'patterns') {
			const patterns = escalation.analyzeEscalationPatterns();
			return json({ patterns });
		}

		return json({ error: 'Invalid action or missing parameters' }, { status: 400 });
	} catch (e) {
		return json({ error: (e as Error).message }, { status: 500 });
	}
};
