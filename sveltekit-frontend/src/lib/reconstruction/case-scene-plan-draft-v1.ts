import { z } from 'zod';
import { SceneGenerationPlanV1BodySchema, type SceneGenerationPlanV1Body } from './scene-generation-plan-v1.js';
import { CaseSceneFetchParametersInputV1Schema } from './case-scene-fetch-contract-v1.js';

const evidenceIdSchema = z.string().uuid();
const parameterResponseSchema = z.object({
	schema: z.literal('parent-atlas.case-scene-fetch-parameters/v1'),
	caseId: z.string().uuid(),
	requestHash: z.string().regex(/^[a-f0-9]{64}$/i),
	compiler: z.literal('procedural-three-scene-v1'),
	caseIntake: z.unknown().nullable(),
	brief: CaseSceneFetchParametersInputV1Schema.shape.brief,
	sourceEvidence: z.array(z.object({ evidenceId: evidenceIdSchema, sha256: z.string().regex(/^[a-f0-9]{64}$/i).nullable(), revisionVerified: z.literal(false) }).strict()),
	environment: CaseSceneFetchParametersInputV1Schema.shape.environment,
	interpretation: z.object({ who: z.literal('pseudonymous_visual_handles'), why: z.literal('hypothesis_or_unknown'), clocks: z.literal('source_local_unaligned'), geometry: z.literal('illustrative_uncalibrated') }).strict()
}).strict();

export type SceneDraftActorV1 = { actorId: string; label: string; appearance: string; evidenceIds: string[] };
export type SceneDraftObjectV1 = { objectId: string; registryId: string; label: string; positionMeters: [number, number, number] };
export type SceneDraftTargetRefV1 = { kind: 'actor' | 'primitive'; targetId: string };
export type SceneDraftEventV1 = {
	eventId: string; label: string; cueType: 'enter' | 'exit' | 'move' | 'interact' | 'alarm' | 'evacuate' | 'timed_prop' | 'interview' | 'custom';
	sourceEvidenceId: string; startMs: number; endMs: number; uncertaintyMs: number;
	targetKind: 'actor' | 'primitive'; targetId: string; action: 'none' | 'visible' | 'move' | 'pulse';
	additionalTargets?: SceneDraftTargetRefV1[];
	fromMeters: [number, number, number]; toMeters: [number, number, number];
	sourceEvent?: NonNullable<SceneGenerationPlanV1Body['events'][number]['sourceEvent']>;
};

/** Reopen the subset the editor can represent without dropping data from a saved plan. */
export function restoreCaseSceneDraftV1(plan: SceneGenerationPlanV1Body) {
	const kind = plan.environment.kind;
	if (kind === 'custom' || plan.actors.length > 64 || plan.primitives.length > 100 || plan.events.length > 128 ||
		plan.assets.length || plan.reviewedObservations.length) throw new Error('This revision can be viewed but its plan uses fields outside the editor.');
	const placements = new Map(plan.placements.map((placement) => [placement.targetId, placement]));
	const coordinates = (values: readonly [number?, number?, number?, ...unknown[]]): [number, number, number] => {
		const [x, y, z] = values;
		if (x === undefined || y === undefined || z === undefined) throw new Error('A saved position is incomplete.');
		return [x, y, z];
	};
	if (placements.size !== plan.actors.length + plan.primitives.length || placements.size !== plan.placements.length ||
		plan.actors.some(({ actorId }) => placements.get(actorId)?.targetKind !== 'actor')) {
		throw new Error('This revision has placements outside the editor.');
	}
	const objects: SceneDraftObjectV1[] = plan.primitives.map(({ objectId, registryId }) => {
		const placement = placements.get(objectId);
		if (placement?.targetKind !== 'primitive') throw new Error('A prop placement is unavailable.');
		return { objectId, registryId, label: objectId, positionMeters: coordinates(placement.positionMeters) };
	});
	const events = plan.events.map((event): SceneDraftEventV1 => {
		const [target, ...additionalTargets] = event.targetRefs;
		const actorTargets = event.targetRefs.filter((item) => item.kind === 'actor').map((item) => item.targetId).sort();
		if (!target || target.kind === 'asset' || additionalTargets.some((item) => item.kind === 'asset') || event.evidenceIds.length !== (event.clock.evidenceId === null ? 0 : 1) ||
			new Set(event.targetRefs.map((item) => `${item.kind}:${item.targetId}`)).size !== event.targetRefs.length ||
			event.status !== 'hypothesis' || event.action?.type === 'visible_during_interval' && !event.action.visible ||
			JSON.stringify([...event.actorIds].sort()) !== JSON.stringify(actorTargets)) {
			throw new Error('This revision contains an event outside the editor.');
		}
		const move = event.action?.type === 'move_during_interval' ? event.action : undefined;
		return {
			eventId: event.eventId, label: event.label, cueType: event.cueType, sourceEvidenceId: event.clock.evidenceId ?? '',
			startMs: event.clock.startMs, endMs: event.clock.endMs, uncertaintyMs: event.clock.uncertaintyMs,
			targetKind: target.kind, targetId: target.targetId,
			additionalTargets: additionalTargets.map((item) => ({ kind: item.kind as 'actor' | 'primitive', targetId: item.targetId })),
			action: move ? 'move' : event.action?.type === 'pulse_light_during_interval' ? 'pulse' : event.action ? 'visible' : 'none',
			fromMeters: move ? coordinates(move.fromMeters) : [0, 0, 0],
			toMeters: move ? coordinates(move.toMeters) : [2, 0, 0],
			sourceEvent: event.sourceEvent ?? undefined
		};
	});
	return {
		kind, actors: plan.actors, objects, events, evidenceIds: plan.sources.map((source) => source.evidenceId),
		why: { status: plan.narrative.why.status, text: plan.narrative.why.text ?? '', evidenceIds: plan.narrative.why.evidenceIds },
		how: { status: plan.narrative.how.status, text: plan.narrative.how.text ?? '', evidenceIds: plan.narrative.how.evidenceIds }
	};
}

/** Build illustrative cues; linked video review claims still require server validation. */
export function buildCaseScenePlanDraftV1(input: {
	caseId: string; sceneId: string; expectedSceneRevision: number;
	parameters: unknown; environmentKind: 'urban' | 'beach' | 'indoor' | 'four-bedroom-house'; seed: number;
	actors: SceneDraftActorV1[]; objects: SceneDraftObjectV1[]; events: SceneDraftEventV1[];
	basePlan?: SceneGenerationPlanV1Body;
}) {
	const parameters = parameterResponseSchema.parse(input.parameters);
	if (parameters.caseId !== input.caseId) throw new Error('SCENE_DRAFT_CASE_MISMATCH');
	const sourceById = new Map(parameters.sourceEvidence.map((source) => [source.evidenceId, source]));
	const referenced = new Set<string>([
		...input.actors.flatMap((actor) => actor.evidenceIds),
		...input.events.flatMap((event) => event.sourceEvidenceId ? [event.sourceEvidenceId] : [])
	]);
	for (const id of referenced) if (!sourceById.has(id)) throw new Error('SCENE_DRAFT_SOURCE_NOT_SELECTED');
	const sources = [...sourceById.keys()].sort().map((evidenceId) => {
		const source = sourceById.get(evidenceId)!;
		if (!source.sha256) throw new Error(`SCENE_DRAFT_SOURCE_HASH_UNAVAILABLE:${evidenceId}`);
		return { evidenceId, sha256: source.sha256, sourceRevision: `sha256:${source.sha256}` };
	});
	const base = input.basePlan;
	const previousPlacements = new Map(base?.placements.map((placement) => [placement.targetId, placement]));
	const placementIds = new Set(base?.placements.map((placement) => placement.placementId));
	function place(targetKind: 'actor' | 'primitive', targetId: string, positionMeters: [number, number, number]) {
		const previous = previousPlacements.get(targetId);
		if (previous) return { ...previous, positionMeters: targetKind === 'actor' ? previous.positionMeters : positionMeters };
		let number = placementIds.size + 1;
		while (placementIds.has(`PLACEMENT-EDIT-${number}`)) number += 1;
		const placementId = `PLACEMENT-EDIT-${number}`;
		placementIds.add(placementId);
		return { placementId, targetKind, targetId, positionMeters, rotationQuaternion: [0, 0, 0, 1], scale: [1, 1, 1] };
	}
	const placements = [
		...input.actors.map((actor, index) => place('actor', actor.actorId, [index * 1.2 - (input.actors.length - 1) * 0.6, 0, 0])),
		...input.objects.map((object) => place('primitive', object.objectId, object.positionMeters))
	];
	const narrativeClaim = (field: 'why' | 'how') => {
		const inputClaim = parameters.brief[field];
		const text = field === 'why' ? ('text' in inputClaim ? inputClaim.text : undefined) : ('description' in inputClaim ? inputClaim.description : undefined);
		const prior = base?.narrative[field];
		if (prior && prior.status === inputClaim.status && (prior.text ?? '') === (text ?? '') &&
			JSON.stringify(prior.evidenceIds) === JSON.stringify(inputClaim.evidenceIds)) return prior;
		return { status: inputClaim.status, ...(text ? { text } : {}), evidenceIds: inputClaim.evidenceIds,
			reviewDecisionId: null, reviewStatus: 'unreviewed' as const };
	};
	const candidate = {
		schema: 'parent-atlas.scene-generation-plan/v1' as const, caseId: input.caseId, sceneId: input.sceneId,
		expectedSceneRevision: input.expectedSceneRevision, generator: 'procedural-three-scene-v1' as const,
		caseIntake: parameters.caseIntake, narrative: {
			why: narrativeClaim('why'), how: narrativeClaim('how')
		},
		sources, reviewedObservations: [], actors: input.actors,
		primitives: input.objects.map(({ objectId, registryId }) => ({ objectId, registryId })), assets: [], placements,
		events: input.events.map((event) => {
			const targetRefs = [{ kind: event.targetKind, targetId: event.targetId }, ...(event.additionalTargets ?? [])];
			const actorIds = [...new Set(targetRefs.filter((target) => target.kind === 'actor').map((target) => target.targetId))];
			return {
			eventId: event.eventId, cueType: event.cueType, label: event.label, status: 'hypothesis' as const,
			reviewStatus: event.sourceEvent ? 'accepted' as const : 'unreviewed' as const,
			evidenceIds: event.sourceEvidenceId ? [event.sourceEvidenceId] : [], actorIds, targetRefs,
			...(event.action === 'none' ? {} : { action: event.action === 'move'
				? { type: 'move_during_interval' as const, fromMeters: event.fromMeters, toMeters: event.toMeters }
				: event.action === 'pulse'
					? { type: 'pulse_light_during_interval' as const, colorHex: '#ffb347', minIntensity: 0.15, maxIntensity: 2.5, periodMs: 900 }
					: { type: 'visible_during_interval' as const, visible: true } }),
			clock: { evidenceId: event.sourceEvidenceId || null, clockId: event.sourceEvidenceId ? `evidence:${event.sourceEvidenceId}` : `scene:${input.sceneId}`, startMs: event.startMs, endMs: event.endMs, uncertaintyMs: event.uncertaintyMs },
			sourceEvent: event.sourceEvent ?? null
			};
		}),
		environment: base?.environment.kind === input.environmentKind ? base.environment : { kind: input.environmentKind, seed: input.seed, customRecipeId: null, cellSizeMeters: 32 as const, extentMeters: { x: 256, z: 256 }, coordinateStatus: 'illustrative_uncalibrated' as const, calibrationEvidenceIds: [] },
		quality: base?.quality ?? { profile: 'retro' as const, maxTextureDimension: 128 as const, maxTriangles: 100_000, maxInstances: 20_000, activeSceneMemoryMiB: 8 },
		provenance: { intakeStatus: 'USER_INTAKE_UNVERIFIED' as const, clockPolicy: 'source_local_unaligned' as const, identityPolicy: 'pseudonymous_visual_handles' as const, motivePolicy: 'unknown_or_cited_hypothesis' as const }
	};
	return SceneGenerationPlanV1BodySchema.parse(candidate);
}
