import { z } from 'zod';

const evidenceRefs = z.array(z.string().uuid()).max(100);
const actorInput = z.object({
	actorId: z.string().regex(/^ACTOR-[A-Z0-9-]{1,48}$/),
	label: z.string().min(1).max(120),
	appearance: z.string().max(500).default('Unspecified; placeholder only'),
	evidenceIds: evidenceRefs.default([])
}).strict();
const eventInput = z.object({
	eventId: z.string().regex(/^EVENT-[A-Z0-9-]{1,48}$/),
	what: z.string().min(1).max(1000),
	status: z.enum(['hypothesis', 'disputed']),
	evidenceIds: evidenceRefs.min(1),
	timeLanes: z.array(z.object({
		evidenceId: z.string().uuid(), clockId: z.string().min(1).max(120),
		startMs: z.number().int().nonnegative(), endMs: z.number().int().positive(),
		uncertaintyMs: z.number().int().nonnegative().default(0)
	}).strict().refine((lane) => lane.endMs > lane.startMs, 'endMs must be after startMs')).max(32).default([])
}).strict();
const whyInput = z.object({
	status: z.enum(['unknown', 'hypothesis', 'disputed']),
	text: z.string().max(1000).optional(), evidenceIds: evidenceRefs.default([])
}).strict().superRefine((value, ctx) => {
	if (value.status === 'unknown' && value.text?.trim()) ctx.addIssue({ code: 'custom', path: ['text'], message: 'Unknown motive cannot contain an asserted explanation' });
	if (value.status !== 'unknown' && (!value.text?.trim() || value.evidenceIds.length === 0)) ctx.addIssue({ code: 'custom', message: 'A motive hypothesis or dispute needs text and evidence references' });
});
const howInput = z.object({
	status: z.enum(['unknown', 'hypothesis', 'disputed']),
	description: z.string().max(1000).optional(), evidenceIds: evidenceRefs.default([])
}).strict().superRefine((value, ctx) => {
	if (value.status !== 'unknown' && (!value.description?.trim() || value.evidenceIds.length === 0)) ctx.addIssue({ code: 'custom', message: 'A method description needs evidence references' });
	if (value.status === 'unknown' && value.description?.trim()) ctx.addIssue({ code: 'custom', path: ['description'], message: 'Unknown method cannot contain an asserted description' });
});

export const CaseSceneFetchParametersInputV1Schema = z.object({
	sceneId: z.string().uuid(), expectedRevision: z.number().int().nonnegative(), sourceEvidenceIds: evidenceRefs.default([]),
	brief: z.object({
		who: z.array(actorInput).max(64).default([]), what: z.array(eventInput).max(128).default([]), why: whyInput, how: howInput
	}).strict(),
	environment: z.object({
		kind: z.enum(['urban', 'beach', 'indoor', 'four-bedroom-house', 'custom']),
		cellSizeMeters: z.union([z.literal(16), z.literal(32), z.literal(64)]).default(32),
		coordinateStatus: z.literal('illustrative_uncalibrated').default('illustrative_uncalibrated')
	}).strict()
}).strict().superRefine((request, ctx) => {
	const selected = new Set(request.sourceEvidenceIds);
	if (selected.size !== request.sourceEvidenceIds.length) ctx.addIssue({ code: 'custom', path: ['sourceEvidenceIds'], message: 'Evidence IDs must be unique' });
	const refs = [
		...request.brief.who.flatMap((actor) => actor.evidenceIds),
		...request.brief.what.flatMap((event) => [...event.evidenceIds, ...event.timeLanes.map((lane) => lane.evidenceId)]),
		...request.brief.why.evidenceIds,
		...request.brief.how.evidenceIds
	];
	for (const ref of refs) if (!selected.has(ref)) ctx.addIssue({ code: 'custom', path: ['sourceEvidenceIds'], message: `Reference ${ref} is not in selected evidence` });
	if (new Set(request.brief.what.map((event) => event.eventId)).size !== request.brief.what.length) ctx.addIssue({ code: 'custom', path: ['brief', 'what'], message: 'Event IDs must be unique' });
	if (new Set(request.brief.who.map((actor) => actor.actorId)).size !== request.brief.who.length) ctx.addIssue({ code: 'custom', path: ['brief', 'who'], message: 'Actor IDs must be unique' });
});

export type CaseSceneFetchParametersInputV1 = z.infer<typeof CaseSceneFetchParametersInputV1Schema>;

/** Structured intake saved on new cases; values remain user-authored and unverified. */
export const CaseSceneIntakeContextV1Schema = z.object({
	schema: z.literal('parent-atlas.case-scene-intake/v1'),
	status: z.literal('USER_INTAKE_UNVERIFIED'),
	who: z.string().max(1000).nullable(),
	what: z.string().max(1000).nullable(),
	when: z.string().max(500).nullable(),
	where: z.string().max(500).nullable(),
	why: z.string().max(1000).nullable(),
	how: z.string().max(1000).nullable()
}).strict();
export type CaseSceneIntakeContextV1 = z.infer<typeof CaseSceneIntakeContextV1Schema>;

/** Client-side fetch config; the server remains responsible for all case and evidence checks. */
export function buildCaseSceneFetchRequestV1(caseId: string, input: CaseSceneFetchParametersInputV1): { url: string; init: RequestInit } {
	if (!z.string().uuid().safeParse(caseId).success) throw new TypeError('CASE_ID_INVALID');
	const request = CaseSceneFetchParametersInputV1Schema.parse(input);
	return {
		url: `/api/cases/${encodeURIComponent(caseId)}/scene-reconstruction/parameters`,
		init: { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request), credentials: 'same-origin', cache: 'no-store' }
	};
}
