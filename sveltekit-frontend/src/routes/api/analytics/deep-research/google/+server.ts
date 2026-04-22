import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import {
	approveResearchPlan,
	getDeepResearchStatus,
	isDeepResearchEnabled,
	startDeepResearch,
	followUpDeepResearch,
} from '$lib/server/ai/deep-research-client.js';
import { summarizeDeepResearchInteraction } from '$lib/server/ai/deep-research-summary.js';

const startSchema = z.object({
	action: z.literal('start').default('start'),
	input: z.string().min(3).max(20_000),
	agent: z.enum(['deep-research-preview-04-2026', 'deep-research-max-preview-04-2026']).optional(),
	collaborativePlanning: z.boolean().optional(),
	visualization: z.enum(['auto', 'off']).optional(),
	thinkingSummaries: z.enum(['auto', 'none']).optional(),
	systemInstruction: z.string().max(10_000).optional(),
});

const followUpSchema = z.object({
	action: z.literal('follow-up'),
	interactionId: z.string().min(1),
	input: z.string().min(1).max(20_000),
	agent: z.enum(['deep-research-preview-04-2026', 'deep-research-max-preview-04-2026']).optional(),
	collaborativePlanning: z.boolean().optional(),
	visualization: z.enum(['auto', 'off']).optional(),
	thinkingSummaries: z.enum(['auto', 'none']).optional(),
	systemInstruction: z.string().max(10_000).optional(),
});

const approveSchema = z.object({
	action: z.literal('approve-plan'),
	interactionId: z.string().min(1),
	message: z.string().min(1).max(5_000).optional(),
});

const postSchema = z.discriminatedUnion('action', [startSchema, followUpSchema, approveSchema]);

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!isDeepResearchEnabled()) {
		return json({ error: 'GEMINI_API_KEY not configured' }, { status: 503 });
	}

	const interactionId = url.searchParams.get('interactionId');
	if (!interactionId) {
		return json({ error: 'interactionId is required' }, { status: 400 });
	}

	try {
		const interaction = await getDeepResearchStatus(interactionId);
		return json(summarizeDeepResearchInteraction(interaction));
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to fetch Deep Research status' },
			{ status: 502 },
		);
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!isDeepResearchEnabled()) {
		return json({ error: 'GEMINI_API_KEY not configured' }, { status: 503 });
	}

	const raw = await request.json().catch(() => ({}));
	const parsed = postSchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	try {
		const payload = parsed.data;
		if (payload.action === 'follow-up') {
			const interaction = await followUpDeepResearch({
				interactionId: payload.interactionId,
				input: payload.input,
				agent: payload.agent,
				collaborativePlanning: payload.collaborativePlanning,
				visualization: payload.visualization,
				thinkingSummaries: payload.thinkingSummaries,
				systemInstruction: payload.systemInstruction,
			});
			return json(summarizeDeepResearchInteraction(interaction));
		}

		if (payload.action === 'approve-plan') {
			const interaction = await approveResearchPlan(payload.interactionId, payload.message);
			return json(summarizeDeepResearchInteraction(interaction));
		}

		const interaction = await startDeepResearch({
			input: payload.input,
			agent: payload.agent,
			collaborativePlanning: payload.collaborativePlanning,
			visualization: payload.visualization,
			thinkingSummaries: payload.thinkingSummaries,
			systemInstruction: payload.systemInstruction,
		});

		return json(summarizeDeepResearchInteraction(interaction), { status: 202 });
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to start Deep Research' },
			{ status: 502 },
		);
	}
};