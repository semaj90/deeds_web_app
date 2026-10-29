import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { sampleStory } from '$lib/courtroom/story/engine.js';
import { routeInference } from '$lib/server/inference/inference-router.js';
import { requireUser } from '$lib/server/auth-utils.js';

const allowedIntents = ['answer', 'decline', 'ask_clarification'] as const;
const allowedEvidence = ['ledger-photo'] as const;
const requestSchema = z.object({
	caseId: z.literal(sampleStory.id),
	storyVersion: z.literal(sampleStory.version),
	actorId: z.enum(['alice', 'jester']),
	phase: z.enum(['lobby', 'opening', 'testimony', 'cross', 'verdict', 'closed']),
	topic: z.string().trim().min(1).max(300),
	evidenceIds: z.array(z.enum(allowedEvidence)).max(1),
}).strict();

const modelResultSchema = z.object({
	text: z.string().trim().min(1).max(500),
	intent: z.enum(allowedIntents),
	emotion: z.enum(['neutral', 'confident', 'nervous', 'angry', 'relieved']).optional(),
}).strict();

export const POST: RequestHandler = async (event) => {
	requireUser(event);

	let raw: unknown;
	try {
		raw = await event.request.json();
	} catch {
		return json({ error: 'invalid_json' }, { status: 400 });
	}

	const parsed = requestSchema.safeParse(raw);
	if (!parsed.success) return json({ error: 'invalid_dialogue_request' }, { status: 400 });

	const request = parsed.data;
	const actor = sampleStory.actors.find((candidate) => candidate.id === request.actorId);
	if (!actor) return json({ error: 'unknown_actor' }, { status: 400 });
	const evidenceFacts = request.evidenceIds.includes('ledger-photo')
		? ['A fictional exhibit named ledger-photo is admitted. Its contents are not specified.']
		: [];

	try {
		const result = await routeInference({
			model: undefined,
			maxTokens: 180,
			temperature: 0.2,
			systemPrompt: [
				'You write a short fictional courtroom dialogue suggestion for a game.',
				'This is not legal advice, testimony, or a factual claim about a real case.',
				'Use only the fictional facts provided. Do not invent exhibit contents or facts.',
				'Return one JSON object with exactly: text, intent, emotion.',
				`intent must be one of: ${allowedIntents.join(', ')}.`,
				'emotion may be neutral, confident, nervous, angry, or relieved.',
			].join(' '),
			prompt: JSON.stringify({
				actor: actor.name,
				phase: request.phase,
				topic: request.topic,
				admittedFictionalEvidence: evidenceFacts,
			}),
		});
		const candidate = JSON.parse(result.text) as unknown;
		const validated = modelResultSchema.safeParse(candidate);
		if (!validated.success) return json({ error: 'invalid_model_proposal' }, { status: 502 });

		return json({
			caseId: request.caseId,
			actorId: request.actorId,
			phase: request.phase,
			evidenceIds: request.evidenceIds,
			allowedIntents,
			modelRevision: result.model,
			...validated.data,
			proposalOnly: true,
		});
	} catch {
		return json({ error: 'dialogue_assistance_unavailable' }, { status: 503 });
	}
};
