import { z } from 'zod';

export const sceneCaptionScopeV1Schema = z.object({
	caseId: z.uuid(), evidenceId: z.uuid(), eventId: z.uuid(),
	sourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
	analysisRevision: z.string().min(1).max(256),
	startMs: z.number().int().nonnegative(), endMs: z.number().int().positive()
}).strict().refine(({ startMs, endMs }) => endMs > startMs);
export type SceneCaptionScopeV1 = z.infer<typeof sceneCaptionScopeV1Schema>;

export const sceneCaptionResponseV1Schema = z.object({
	scope: sceneCaptionScopeV1Schema,
	captions: z.array(z.object({
		referenceId: z.uuid(), segmentId: z.uuid(), startMs: z.number().int().nonnegative(), endMs: z.number().int().positive(),
		text: z.string().min(1).max(10_000), reviewed: z.boolean()
	}).strict().refine(({ startMs, endMs }) => endMs > startMs)).max(64),
	unavailableCount: z.number().int().nonnegative().max(256),
	error: z.null().optional()
}).strict();
export type SceneCaptionResponseV1 = z.infer<typeof sceneCaptionResponseV1Schema>;
export const SCENE_CAPTION_EVENT_LIMIT_V1 = 4;
export const SCENE_CAPTION_LOOKAHEAD_MS_V1 = 1500;

export function sceneCaptionScopeKeyV1(scope: SceneCaptionScopeV1): string {
	return JSON.stringify([scope.caseId, scope.evidenceId, scope.eventId, scope.sourceRevision, scope.analysisRevision, scope.startMs, scope.endMs]);
}

/** Keep requests stable within a window and bound work during overlaps. */
export function sceneCaptionRequestWindowV1(scopes: readonly SceneCaptionScopeV1[], sourceTimeMs: number) {
	const eligible = scopes.filter((scope) => scope.endMs > sourceTimeMs && scope.startMs <= sourceTimeMs + SCENE_CAPTION_LOOKAHEAD_MS_V1);
	return [...new Map(eligible.map((scope) => [sceneCaptionScopeKeyV1(scope), scope])).values()]
		.sort((a, b) => a.startMs - b.startMs || a.eventId.localeCompare(b.eventId))
		.slice(0, SCENE_CAPTION_EVENT_LIMIT_V1);
}

export function activeSceneCaptionsV1(result: SceneCaptionResponseV1, sourceTimeMs: number) {
	if (sourceTimeMs < result.scope.startMs || sourceTimeMs >= result.scope.endMs) return [];
	return result.captions.filter(({ startMs, endMs }) => sourceTimeMs >= startMs && sourceTimeMs < endMs);
}

export function activeSceneLaneCaptionsV1(results: readonly SceneCaptionResponseV1[], sourceTimeMs: number) {
	const entries = results.flatMap((result) => activeSceneCaptionsV1(result, sourceTimeMs));
	return [...new Map(entries.map((entry) => [entry.referenceId, entry])).values()]
		.sort((a, b) => a.startMs - b.startMs || a.referenceId.localeCompare(b.referenceId));
}
