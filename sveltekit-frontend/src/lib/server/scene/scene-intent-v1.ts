/**
 * SceneIntent v1: the only shape a planner (LLM) may emit for a scene storyboard (SCENE-17).
 *
 * Rules enforced here, not in the prompt:
 * - every beat cites at least one evidence item with its source revision;
 * - a `measured` beat cites only measured sources (transcript segment or scene cut);
 *   timeline events are not measurements and force `hypothesis`;
 * - beat times are relative to the clip start and must lie inside the clip;
 * - clip length is fixed at 20 s by decision SCENE-DEC-A; widening needs a new schema version.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';

export const SCENE_INTENT_SCHEMA_V1 = 'atlas.scene-intent.v1';
export const SCENE_INTENT_CLIP_SECONDS_V1 = 20;

const sha256Revision = z.string().regex(/^sha256:[0-9a-f]{64}$/, 'sourceRevision must be sha256:<64 lowercase hex>');
const nonNegativeInt = z.number().int().nonnegative();

const transcriptCitation = z.object({
	source: z.literal('transcript_segment'),
	evidenceId: z.uuid(),
	sourceRevision: sha256Revision,
	startMs: nonNegativeInt,
	endMs: nonNegativeInt,
}).refine((c) => c.endMs >= c.startMs, 'endMs must not precede startMs');

const sceneCutCitation = z.object({
	source: z.literal('scene_cut'),
	evidenceId: z.uuid(),
	sourceRevision: sha256Revision,
	cutSec: z.number().nonnegative(),
});

const timelineEventCitation = z.object({
	source: z.literal('timeline_event'),
	evidenceId: z.uuid(),
	sourceRevision: sha256Revision,
	eventRef: z.string().min(1).max(200),
});

export const sceneIntentCitationV1 = z.discriminatedUnion('source', [
	transcriptCitation,
	sceneCutCitation,
	timelineEventCitation,
]);

export const sceneIntentBeatV1 = z.object({
	id: z.string().regex(/^beat-\d{2}$/),
	text: z.string().min(1).max(280),
	kind: z.enum(['measured', 'hypothesis', 'fixture']),
	startSec: z.number().nonnegative(),
	endSec: z.number().positive(),
	citations: z.array(sceneIntentCitationV1).min(1).max(8),
}).superRefine((beat, ctx) => {
	if (beat.endSec <= beat.startSec) {
		ctx.addIssue({ code: 'custom', message: 'endSec must be greater than startSec', path: ['endSec'] });
	}
	if (beat.kind === 'measured' && beat.citations.some((c) => c.source === 'timeline_event')) {
		ctx.addIssue({
			code: 'custom',
			message: 'a measured beat may not cite a timeline_event; use kind hypothesis',
			path: ['kind'],
		});
	}
});

export const sceneIntentV1 = z.object({
	schemaVersion: z.literal(SCENE_INTENT_SCHEMA_V1),
	clipSeconds: z.literal(SCENE_INTENT_CLIP_SECONDS_V1),
	outputForm: z.literal('storyboard-2d'),
	seed: nonNegativeInt,
	beats: z.array(sceneIntentBeatV1).min(1).max(6),
}).superRefine((intent, ctx) => {
	const ids = new Set<string>();
	intent.beats.forEach((beat, index) => {
		if (ids.has(beat.id)) {
			ctx.addIssue({ code: 'custom', message: `duplicate beat id ${beat.id}`, path: ['beats', index, 'id'] });
		}
		ids.add(beat.id);
		if (beat.endSec > intent.clipSeconds) {
			ctx.addIssue({
				code: 'custom',
				message: `beat ends after the ${intent.clipSeconds} s clip`,
				path: ['beats', index, 'endSec'],
			});
		}
	});
});

export type SceneIntentV1 = z.infer<typeof sceneIntentV1>;

/** Throws a ZodError if the value is not a valid SceneIntent v1. */
export function parseSceneIntentV1(raw: unknown): SceneIntentV1 {
	return sceneIntentV1.parse(raw);
}

/** Canonical JSON: object keys sorted recursively, no whitespace. Arrays keep their order. */
export function canonicalJsonV1(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map((item) => canonicalJsonV1(item)).join(',')}]`;
	const record = value as Record<string, unknown>;
	const entries = Object.keys(record)
		.sort()
		.filter((key) => record[key] !== undefined)
		.map((key) => `${JSON.stringify(key)}:${canonicalJsonV1(record[key])}`);
	return `{${entries.join(',')}}`;
}

/** SHA-256 of the canonical JSON bytes, as `sha256:<64 lowercase hex>`. */
export function sceneIntentSha256V1(intent: SceneIntentV1): string {
	return `sha256:${createHash('sha256').update(canonicalJsonV1(intent), 'utf8').digest('hex')}`;
}
