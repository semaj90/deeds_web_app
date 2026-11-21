import { z } from 'zod';
import { SceneGenerationPlanV1Schema } from './scene-generation-plan-v1.js';

export const HOUSE_ROOMS_V1 = [
	['bedroom-1', 'Bedroom 1', -1, -6, 'bed'],
	['bedroom-2', 'Bedroom 2', 1, -6, 'bed'],
	['bedroom-3', 'Bedroom 3', -1, -2, 'bed'],
	['bedroom-4', 'Bedroom 4', 1, -2, 'bed'],
	['bathroom', 'Bathroom', -1, 2, 'tub'],
	['kitchen', 'Kitchen', 1, 2, 'counter'],
	['living', 'Living room', -1, 6, 'sofa'],
	['dining', 'Dining room', 1, 6, 'table']
] as const;

const houseObjects = new Set([
	'hallway', 'bedroom-1-desk', 'dining-chair-1', 'dining-chair-2',
	...HOUSE_ROOMS_V1.flatMap(([id, , , , furnishing]) => [id, `${id}-${furnishing}`])
]);

const annotation = z.object({
	id: z.uuid(),
	eventId: z.string().min(1).max(64),
	sourceTimeMs: z.number().int().nonnegative(),
	text: z.string().trim().min(1).max(1000),
	objectId: z.string().min(1).max(64).optional()
}).strict();

export type ScenePreviewAnnotationV1 = z.infer<typeof annotation>;

export const scenePreviewDraftV1Schema = z.object({
	schema: z.literal('parent-atlas.scene-preview-draft/v1'),
	plan: SceneGenerationPlanV1Schema,
	annotations: z.array(annotation).max(500)
}).strict().superRefine(({ plan, annotations }, ctx) => {
	const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
	// Reviewed inputs and asset-backed scenes use their existing admission owners.
	if (plan.environment.coordinateStatus !== 'illustrative_uncalibrated' || plan.environment.kind === 'custom' ||
		plan.assets.length || plan.reviewedObservations.length ||
		[plan.narrative.why, plan.narrative.how].some((claim) => claim.reviewStatus !== 'unreviewed' || claim.reviewDecisionId !== null)) {
		issue(['plan'], 'This draft accepts only illustrative procedural plans with unreviewed claims');
	}
	const events = new Map(plan.events.map((event) => [event.eventId, event]));
	const selectableObjects = new Set([
		...plan.actors.map((actor) => actor.actorId),
		...plan.primitives.map((primitive) => primitive.objectId),
		...(plan.environment.kind === 'four-bedroom-house' ? houseObjects : [])
	]);
	for (const event of plan.events) {
		if (event.status === 'measured' || event.reviewStatus !== (event.sourceEvent ? 'accepted' : 'unreviewed') ||
			event.clock.clockId !== (event.clock.evidenceId === null ? `scene:${plan.sceneId}` : `evidence:${event.clock.evidenceId}`)) {
			issue(['plan', 'events'], 'Draft cues must use their scene or source clock. Accepted review requires an exact source event.');
		}
	}
	const ids = new Set<string>();
	for (const [index, note] of annotations.entries()) {
		const event = events.get(note.eventId);
		if (!event || note.sourceTimeMs < event.clock.startMs || note.sourceTimeMs >= event.clock.endMs) {
			issue(['annotations', index, 'sourceTimeMs'], 'The note must fall within its event interval');
		}
		if (ids.has(note.id)) issue(['annotations', index, 'id'], 'Duplicate annotation ID');
		ids.add(note.id);
		if (note.objectId && !selectableObjects.has(note.objectId)) {
			issue(['annotations', index, 'objectId'], 'The object is outside this layout');
		}
	}
});
