import { z } from 'zod';
import { CaseSceneIntakeContextV1Schema } from './case-scene-fetch-contract-v1.js';
import { sceneCameraPresetV1Schema } from './scene-camera-cue-v1.js';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/i).transform((value) => value.toLowerCase());
const evidenceId = z.string().uuid();
const stableId = (prefix: 'ACTOR' | 'EVENT' | 'OBJECT' | 'PLACEMENT') =>
	z.string().regex(new RegExp(`^${prefix}-[A-Z0-9-]{1,48}$`));
const boundedMeter = (limit: number) => z.number().finite().min(-limit).max(limit);
export const scenePropRotationActionV1Schema = z.object({
	type: z.literal('rotate_prop_during_interval'),
	degrees: z.number().finite().min(-180).max(180)
}).strict();

const SourceRefV1Schema = z.object({
	evidenceId,
	sourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/i),
	sha256
}).strict().refine((source) => source.sourceRevision.toLowerCase() === `sha256:${source.sha256}`, 'Source revision must equal its SHA-256');

const ReviewedObservationRefV1Schema = z.object({
	observationId: z.string().min(1).max(200),
	evidenceId,
	sourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/i),
	sourceSha256: sha256,
	analysisRevision: z.string().min(1).max(512),
	observationRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/i),
	reviewDecisionId: z.string().uuid(),
	reviewStatus: z.literal('accepted')
}).strict();

const ActorV1Schema = z.object({
	actorId: stableId('ACTOR'),
	label: z.string().min(1).max(120),
	appearance: z.string().max(500).default('Unspecified; placeholder only'),
	evidenceIds: z.array(evidenceId).max(100).default([])
}).strict();

const PrimitiveRefV1Schema = z.object({
	objectId: stableId('OBJECT'),
	registryId: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/)
}).strict();

const AssetRefV1Schema = z.object({
	assetId: z.string().uuid(),
	assetRevision: z.number().int().positive(),
	sha256
}).strict();

const PlacementV1Schema = z.object({
	placementId: stableId('PLACEMENT'),
	targetKind: z.enum(['actor', 'primitive', 'asset']),
	targetId: z.string().min(1).max(128),
	positionMeters: z.tuple([boundedMeter(100_000), boundedMeter(1_000), boundedMeter(100_000)]),
	rotationQuaternion: z.tuple([z.number().finite().min(-1).max(1), z.number().finite().min(-1).max(1), z.number().finite().min(-1).max(1), z.number().finite().min(-1).max(1)]),
	scale: z.tuple([z.number().finite().positive().max(1_000), z.number().finite().positive().max(1_000), z.number().finite().positive().max(1_000)])
}).strict().superRefine((placement, ctx) => {
	const quaternion = placement.rotationQuaternion;
	const norm = Math.sqrt(quaternion[0]! * quaternion[0]! + quaternion[1]! * quaternion[1]! + quaternion[2]! * quaternion[2]! + quaternion[3]! * quaternion[3]!);
	if (norm < 0.999 || norm > 1.001) ctx.addIssue({ code: 'custom', path: ['rotationQuaternion'], message: 'Rotation quaternion must be normalized' });
});

const EventCueV1Schema = z.object({
	eventId: stableId('EVENT'),
	cueType: z.enum(['enter', 'exit', 'move', 'interact', 'alarm', 'evacuate', 'timed_prop', 'interview', 'custom']),
	label: z.string().min(1).max(240),
	status: z.enum(['measured', 'hypothesis', 'disputed', 'unknown']),
	reviewStatus: z.enum(['unreviewed', 'accepted', 'disputed', 'unresolved']),
	evidenceIds: z.array(evidenceId).max(100),
	actorIds: z.array(stableId('ACTOR')).max(64).default([]),
	targetRefs: z.array(z.object({ kind: z.enum(['actor', 'primitive', 'asset']), targetId: z.string().min(1).max(128) }).strict()).max(256).default([]),
	cameraPreset: sceneCameraPresetV1Schema.optional(),
	// Deterministic presentation behavior, separate from the source event's truth/review state.
	// Movement is an authored path proposal in scene-local coordinates, not measured motion.
	action: z.discriminatedUnion('type', [
		z.object({ type: z.literal('visible_during_interval'), visible: z.boolean() }).strict(),
		z.object({ type: z.literal('move_during_interval'), fromMeters: z.tuple([boundedMeter(100_000), boundedMeter(1_000), boundedMeter(100_000)] as const), toMeters: z.tuple([boundedMeter(100_000), boundedMeter(1_000), boundedMeter(100_000)] as const) }).strict(),
		scenePropRotationActionV1Schema,
		z.object({ type: z.literal('pulse_light_during_interval'), colorHex: z.string().regex(/^#[0-9a-f]{6}$/i), minIntensity: z.number().finite().min(0).max(5), maxIntensity: z.number().finite().min(0).max(10), periodMs: z.number().int().min(100).max(10_000) }).strict().refine((action) => action.maxIntensity > action.minIntensity, 'Pulse max intensity must exceed min intensity')
	]).optional(),
	clock: z.object({
		evidenceId: evidenceId.nullable(),
		clockId: z.string().min(1).max(120),
		startMs: z.number().int().nonnegative(),
		endMs: z.number().int().positive(),
		uncertaintyMs: z.number().int().nonnegative()
	}).strict().refine((value) => value.endMs > value.startMs, 'Event endMs must be after startMs'),
	sourceEvent: z.object({
		sourceEvidenceId: evidenceId,
		sourceEventId: z.string().uuid(),
		analysisRevision: z.string().min(1).max(256),
		startMs: z.number().int().nonnegative(),
		endMs: z.number().int().positive()
	}).strict().nullable().default(null)
}).strict();

/** Client-submitted review statuses are claims to validate against canonical review owners; this schema grants no authority. */

const NarrativeClaimV1Schema = z.object({
	status: z.enum(['unknown', 'hypothesis', 'disputed']),
	text: z.string().max(1_000).optional(),
	evidenceIds: z.array(evidenceId).max(100).default([]),
	reviewDecisionId: z.string().uuid().nullable().default(null),
	reviewStatus: z.enum(['unreviewed', 'accepted', 'disputed']).default('unreviewed')
}).strict().superRefine((claim, ctx) => {
	if (claim.status === 'unknown' && (claim.text?.trim() || claim.evidenceIds.length > 0)) {
		ctx.addIssue({ code: 'custom', message: 'Unknown claims cannot carry an explanation or evidence claim' });
	}
	if (claim.status === 'hypothesis' && (!claim.text?.trim() || claim.evidenceIds.length === 0)) {
		ctx.addIssue({ code: 'custom', message: 'A motive/method hypothesis requires text and evidence citations' });
	}
	if (claim.status === 'disputed' && (!claim.text?.trim() || claim.evidenceIds.length === 0)) {
		ctx.addIssue({ code: 'custom', message: 'A disputed motive/method claim requires text and evidence citations' });
	}
	if (claim.reviewStatus === 'accepted' && !claim.reviewDecisionId) ctx.addIssue({ code: 'custom', path: ['reviewDecisionId'], message: 'Accepted narrative claims require a canonical review decision reference' });
	if (claim.reviewStatus === 'disputed' && !claim.reviewDecisionId) ctx.addIssue({ code: 'custom', path: ['reviewDecisionId'], message: 'Disputed narrative claims require a canonical review decision reference' });
});

const EnvironmentV1Schema = z.object({
	kind: z.enum(['urban', 'beach', 'indoor', 'four-bedroom-house', 'custom']),
	seed: z.number().int().nonnegative().max(0xffff_ffff),
	customRecipeId: z.string().min(1).max(128).nullable().default(null),
	cellSizeMeters: z.union([z.literal(16), z.literal(32), z.literal(64)]),
	extentMeters: z.object({ x: z.number().finite().positive().max(10_000), z: z.number().finite().positive().max(10_000) }).strict(),
	coordinateStatus: z.enum(['illustrative_uncalibrated', 'reviewed_transform', 'calibrated_metric']),
	calibrationEvidenceIds: z.array(evidenceId).max(100).default([])
}).strict().superRefine((value, ctx) => {
	if (value.kind === 'custom' && !value.customRecipeId) ctx.addIssue({ code: 'custom', path: ['customRecipeId'], message: 'Custom environments require a recipe ID' });
	if (value.kind === 'four-bedroom-house' && value.coordinateStatus !== 'illustrative_uncalibrated') {
		ctx.addIssue({ code: 'custom', path: ['coordinateStatus'], message: 'The procedural house layout is illustrative' });
	}
	if (value.coordinateStatus !== 'illustrative_uncalibrated' && value.calibrationEvidenceIds.length === 0) {
		ctx.addIssue({ code: 'custom', path: ['calibrationEvidenceIds'], message: 'Reviewed/calibrated coordinates require calibration evidence' });
	}
});

export const SceneGenerationPlanV1BodySchema = z.object({
	schema: z.literal('parent-atlas.scene-generation-plan/v1'),
	caseId: z.string().uuid(),
	sceneId: z.string().uuid(),
	expectedSceneRevision: z.number().int().nonnegative(),
	generator: z.literal('procedural-three-scene-v1'),
	caseIntake: CaseSceneIntakeContextV1Schema.nullable(),
	narrative: z.object({ why: NarrativeClaimV1Schema, how: NarrativeClaimV1Schema }).strict(),
	sources: z.array(SourceRefV1Schema).max(100),
	reviewedObservations: z.array(ReviewedObservationRefV1Schema).max(500).default([]),
	actors: z.array(ActorV1Schema).max(64),
	primitives: z.array(PrimitiveRefV1Schema).max(2_000),
	assets: z.array(AssetRefV1Schema).max(500).default([]),
	placements: z.array(PlacementV1Schema).max(5_000),
	events: z.array(EventCueV1Schema).max(500),
	environment: EnvironmentV1Schema,
	quality: z.object({
		profile: z.enum(['retro', 'balanced', 'high']),
		maxTextureDimension: z.union([z.literal(128), z.literal(256), z.literal(512)]),
		maxTriangles: z.number().int().positive().max(2_000_000),
		maxInstances: z.number().int().positive().max(100_000),
		activeSceneMemoryMiB: z.number().int().positive().max(8)
	}).strict(),
	provenance: z.object({
		intakeStatus: z.literal('USER_INTAKE_UNVERIFIED'),
		clockPolicy: z.literal('source_local_unaligned'),
		identityPolicy: z.literal('pseudonymous_visual_handles'),
		motivePolicy: z.literal('unknown_or_cited_hypothesis')
	}).strict()
}).strict().superRefine((plan, ctx) => {
	const sources = new Map(plan.sources.map((source) => [source.evidenceId, source]));
	if (sources.size !== plan.sources.length) ctx.addIssue({ code: 'custom', path: ['sources'], message: 'Source evidence IDs must be unique' });
	const actorIds = new Set(plan.actors.map((actor) => actor.actorId));
	if (actorIds.size !== plan.actors.length) ctx.addIssue({ code: 'custom', path: ['actors'], message: 'Actor IDs must be unique' });
	const primitiveIds = new Set(plan.primitives.map((primitive) => primitive.objectId));
	if (primitiveIds.size !== plan.primitives.length) ctx.addIssue({ code: 'custom', path: ['primitives'], message: 'Primitive object IDs must be unique' });
	const assetIds = new Set(plan.assets.map((asset) => asset.assetId));
	if (assetIds.size !== plan.assets.length) ctx.addIssue({ code: 'custom', path: ['assets'], message: 'Asset IDs must be unique' });
	const placementIds = new Set<string>();
	for (const [index, placement] of plan.placements.entries()) {
		if (placementIds.has(placement.placementId)) ctx.addIssue({ code: 'custom', path: ['placements', index, 'placementId'], message: 'Placement IDs must be unique' });
		placementIds.add(placement.placementId);
		const targetExists = placement.targetKind === 'actor' ? actorIds.has(placement.targetId)
			: placement.targetKind === 'primitive' ? primitiveIds.has(placement.targetId)
				: assetIds.has(placement.targetId);
		if (!targetExists) ctx.addIssue({ code: 'custom', path: ['placements', index, 'targetId'], message: 'Placement target must exist in the matching registry list' });
		const [x, , z] = placement.positionMeters;
		if (Math.abs(x) > plan.environment.extentMeters.x / 2 || Math.abs(z) > plan.environment.extentMeters.z / 2) {
			ctx.addIssue({ code: 'custom', path: ['placements', index, 'positionMeters'], message: 'Placement is outside the declared environment extent' });
		}
	}
	const eventIds = new Set<string>();
	let pulseLightBindings = 0;
	for (const [index, event] of plan.events.entries()) {
		if (eventIds.has(event.eventId)) ctx.addIssue({ code: 'custom', path: ['events', index, 'eventId'], message: 'Event IDs must be unique' });
		eventIds.add(event.eventId);
		if (event.clock.evidenceId === null) {
			if (event.clock.clockId !== `scene:${plan.sceneId}` || event.evidenceIds.length || event.sourceEvent ||
				event.status !== 'hypothesis' || event.reviewStatus !== 'unreviewed') {
				ctx.addIssue({ code: 'custom', path: ['events', index, 'clock'], message: 'Scene-relative cues must be unreviewed hypotheses without evidence citations' });
			}
		} else if (!sources.has(event.clock.evidenceId) || !event.evidenceIds.includes(event.clock.evidenceId)) {
			ctx.addIssue({ code: 'custom', path: ['events', index, 'clock', 'evidenceId'], message: 'Event clock must be bound to one of its selected source evidence items' });
		}
		if (event.sourceEvent && (event.sourceEvent.sourceEvidenceId !== event.clock.evidenceId || event.sourceEvent.startMs !== event.clock.startMs || event.sourceEvent.endMs !== event.clock.endMs)) {
			ctx.addIssue({ code: 'custom', path: ['events', index, 'sourceEvent'], message: 'Canonical event binding must match the cue source and interval' });
		}
		if (event.status === 'measured' && !event.sourceEvent) ctx.addIssue({ code: 'custom', path: ['events', index, 'sourceEvent'], message: 'Measured cues require a canonical source event binding' });
		for (const actorId of event.actorIds) if (!actorIds.has(actorId)) ctx.addIssue({ code: 'custom', path: ['events', index, 'actorIds'], message: `Unknown actor ${actorId}` });
		const targetKeys = event.targetRefs.map((target) => `${target.kind}:${target.targetId}`);
		if (new Set(targetKeys).size !== targetKeys.length) ctx.addIssue({ code: 'custom', path: ['events', index, 'targetRefs'], message: 'Event target references must be unique' });
		for (const target of event.targetRefs) {
			const exists = target.kind === 'actor' ? actorIds.has(target.targetId)
				: target.kind === 'primitive' ? primitiveIds.has(target.targetId)
					: assetIds.has(target.targetId);
			if (!exists) ctx.addIssue({ code: 'custom', path: ['events', index, 'targetRefs'], message: `Unknown ${target.kind} event target ${target.targetId}` });
		}
		if (event.cueType === 'timed_prop' && event.targetRefs.length === 0) {
			ctx.addIssue({ code: 'custom', path: ['events', index, 'targetRefs'], message: 'Timed prop cues must target a registered primitive or asset' });
		}
		if (event.cueType === 'timed_prop' && event.targetRefs.some((target) => target.kind === 'actor')) {
			ctx.addIssue({ code: 'custom', path: ['events', index, 'targetRefs'], message: 'Timed prop cues cannot target actors' });
		}
		if (event.action?.type === 'move_during_interval' && event.targetRefs.length === 0) {
			ctx.addIssue({ code: 'custom', path: ['events', index, 'targetRefs'], message: 'Movement cues must target a registered scene object' });
		}
		if (event.action?.type === 'pulse_light_during_interval' && event.targetRefs.length === 0) {
			ctx.addIssue({ code: 'custom', path: ['events', index, 'targetRefs'], message: 'Pulse-light cues must target a registered scene object' });
		}
		if (event.action?.type === 'rotate_prop_during_interval' &&
			(!event.targetRefs.length || event.targetRefs.some((target) => target.kind !== 'primitive'))) {
			ctx.addIssue({ code: 'custom', path: ['events', index, 'targetRefs'], message: 'Prop rotation requires primitive targets only' });
		}
		if (event.action?.type === 'pulse_light_during_interval') pulseLightBindings += event.targetRefs.length;
		if (event.status === 'measured' && event.reviewStatus !== 'accepted') {
			ctx.addIssue({ code: 'custom', path: ['events', index, 'reviewStatus'], message: 'Measured event cues require accepted review status' });
		}
	}
	if (pulseLightBindings > 64) ctx.addIssue({ code: 'custom', path: ['events'], message: 'Pulse-light presentation is limited to 64 event-target bindings' });
	for (const [index, observation] of plan.reviewedObservations.entries()) {
		if (plan.reviewedObservations.findIndex((candidate) => candidate.observationId === observation.observationId) !== index) {
			ctx.addIssue({ code: 'custom', path: ['reviewedObservations', index, 'observationId'], message: 'Observation IDs must be unique' });
		}
		const source = sources.get(observation.evidenceId);
		if (!source || source.sourceRevision !== observation.sourceRevision || source.sha256 !== observation.sourceSha256) {
			ctx.addIssue({ code: 'custom', path: ['reviewedObservations', index], message: 'Observation must match a selected source revision and hash' });
		}
	}
	const allEvidenceRefs = [
		...plan.reviewedObservations.map((observation) => observation.evidenceId),
		...plan.actors.flatMap((actor) => actor.evidenceIds),
		...plan.events.flatMap((event) => event.evidenceIds),
		...plan.narrative.why.evidenceIds,
		...plan.narrative.how.evidenceIds,
		...plan.environment.calibrationEvidenceIds
	];
	for (const reference of allEvidenceRefs) if (!sources.has(reference)) ctx.addIssue({ code: 'custom', path: ['sources'], message: `Evidence reference ${reference} is not selected` });
	if (plan.environment.coordinateStatus === 'illustrative_uncalibrated' && plan.environment.calibrationEvidenceIds.length > 0) {
		ctx.addIssue({ code: 'custom', path: ['environment', 'calibrationEvidenceIds'], message: 'Uncalibrated scenes cannot claim calibration references' });
	}
	if (plan.events.some((event) => event.clock.clockId.trim().length === 0)) {
		ctx.addIssue({ code: 'custom', path: ['events'], message: 'Each event must retain its source clock ID' });
	}
});

export const SceneGenerationPlanV1Schema = SceneGenerationPlanV1BodySchema.extend({
	planHash: sha256
}).strict();

export type SceneGenerationPlanV1Body = z.infer<typeof SceneGenerationPlanV1BodySchema>;
export type SceneGenerationPlanV1 = z.infer<typeof SceneGenerationPlanV1Schema>;
