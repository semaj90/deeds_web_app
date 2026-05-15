/**
 * CHR97 Agentic Case Timeline API
 *
 * GET /api/cartridge/timeline?caseId=&userId=
 * → Calls Chr97Agent.GetTimeline() via gRPC
 * → Returns timeline events + AI summary
 * → Degraded 200 response (empty events) when gRPC is unavailable
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getChr97Timeline } from '$lib/server/grpc/chr97-agent-client.js';
import { z } from 'zod';

const querySchema = z.object({
	caseId: z.string().min(1).max(500),
	userId: z.string().max(200).optional(),
});

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const params = { caseId: url.searchParams.get('caseId') ?? '', userId: url.searchParams.get('userId') ?? '' };
	const parsed = querySchema.safeParse(params);
	if (!parsed.success) {
		return json({ events: [], aiSummary: '', error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const { caseId, userId } = parsed.data;

	try {
		const result = await getChr97Timeline(caseId, userId ?? locals.user.id ?? '');

		if (!result) {
			// gRPC disabled or unavailable — degraded contract
			return json({ events: [], aiSummary: '', source: 'unavailable', caseId });
		}

		return json({
			events:     result.events,
			aiSummary:  result.aiSummary,
			source:     result.source,
			caseId,
		});
	} catch (err) {
		console.error('[cartridge-timeline] Error:', err);
		return json({ events: [], aiSummary: '', source: 'error', caseId });
	}
};
