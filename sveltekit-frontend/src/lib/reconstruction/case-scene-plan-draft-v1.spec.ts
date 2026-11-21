import { describe, expect, it } from 'vitest';
import { buildCaseScenePlanDraftV1, restoreCaseSceneDraftV1 } from './case-scene-plan-draft-v1.js';
import { SceneGenerationPlanV1BodySchema } from './scene-generation-plan-v1.js';
import { compileSceneRuntimeRecipeV1 } from './scene-runtime-recipe-v1.js';
import { scenePreviewDraftV1Schema } from './scene-preview-draft-v1.js';
import { createSceneRuntimeThreeV1 } from './scene-runtime-three-v1.js';

const caseId = '44444444-4444-4444-8444-444444444444';
const sceneId = '33333333-3333-4333-8333-333333333333';
const evidenceId = '11111111-1111-4111-8111-111111111111';
const sha256 = 'a'.repeat(64);
const params = { schema: 'parent-atlas.case-scene-fetch-parameters/v1', caseId, requestHash: 'b'.repeat(64), compiler: 'procedural-three-scene-v1', caseIntake: null,
	brief: { who: [], what: [], why: { status: 'unknown', evidenceIds: [] }, how: { status: 'unknown', evidenceIds: [] } },
	sourceEvidence: [{ evidenceId, sha256, revisionVerified: false }], environment: { kind: 'beach', cellSizeMeters: 32, coordinateStatus: 'illustrative_uncalibrated' },
	interpretation: { who: 'pseudonymous_visual_handles', why: 'hypothesis_or_unknown', clocks: 'source_local_unaligned', geometry: 'illustrative_uncalibrated' } };

describe('case scene plan draft v1', () => {
	it('carries an evidence-free timed prop through the scene clock, save contract and editor reopen', () => {
		const candidate = buildCaseScenePlanDraftV1({
			caseId, sceneId, expectedSceneRevision: 0, parameters: { ...params, sourceEvidence: [] },
			environmentKind: 'beach', seed: 3, actors: [],
			objects: [{ objectId: 'OBJECT-01', registryId: 'cone', label: 'Illustrative marker', positionMeters: [1, 0, 0] }],
			events: [{ eventId: 'EVENT-01', label: 'Show marker after setup', cueType: 'timed_prop', sourceEvidenceId: '',
				startMs: 1000, endMs: 3000, uncertaintyMs: 0, targetKind: 'primitive', targetId: 'OBJECT-01',
				action: 'visible', fromMeters: [0, 0, 0], toMeters: [0, 0, 0] }]
		});
		const plan = { ...candidate, planHash: sha256 };
		expect(candidate.sources).toEqual([]);
		expect(candidate.events[0]).toMatchObject({
			evidenceIds: [], sourceEvent: null, clock: { evidenceId: null, clockId: `scene:${sceneId}` }
		});
		const recipe = compileSceneRuntimeRecipeV1(plan);
		expect(recipe.eventLanes).toMatchObject([
			{ clockId: `scene:${sceneId}`, evidenceId: null, events: [{ eventId: 'EVENT-01', startMs: 1000, endMs: 3000 }] }
		]);
		const runtime = createSceneRuntimeThreeV1(recipe);
		try {
			const prop = runtime.targetNodes.get('primitive:OBJECT-01')!;
			runtime.setSourceTime(`scene:${sceneId}`, 999);
			expect(prop.visible).toBe(false);
			runtime.setSourceTime(`scene:${sceneId}`, 1000);
			expect(prop.visible).toBe(true);
			runtime.setSourceTime(`scene:${sceneId}`, 3000);
			expect(prop.visible).toBe(false);
		} finally {
			runtime.dispose();
		}
		expect(scenePreviewDraftV1Schema.safeParse({
			schema: 'parent-atlas.scene-preview-draft/v1', plan, annotations: []
		}).success).toBe(true);
		expect(restoreCaseSceneDraftV1(plan).events[0]?.sourceEvidenceId).toBe('');
		const event = candidate.events[0]!;
		for (const altered of [{ ...event, reviewStatus: 'accepted' }, { ...event, evidenceIds: [evidenceId] },
			{ ...event, clock: { ...event.clock, clockId: `evidence:${evidenceId}` } }]) {
			expect(SceneGenerationPlanV1BodySchema.safeParse({ ...candidate, events: [altered] }).success).toBe(false);
		}
	});

	it('builds a source-bound timed prop hypothesis without promoting allegations', () => {
		const candidate = buildCaseScenePlanDraftV1({ caseId, sceneId, expectedSceneRevision: 0, parameters: params, environmentKind: 'beach', seed: 1,
			actors: [{ actorId: 'ACTOR-01', label: 'Person 01', appearance: 'Unidentified proxy', evidenceIds: [] }],
			objects: [{ objectId: 'OBJECT-01', registryId: 'cone', label: 'Bonfire proxy', positionMeters: [2, 0, 3] }],
			events: [{ eventId: 'EVENT-01', label: 'Several reports describe a bonfire during this interval', cueType: 'timed_prop', sourceEvidenceId: evidenceId,
				startMs: 1000, endMs: 4000, uncertaintyMs: 500, targetKind: 'primitive', targetId: 'OBJECT-01', action: 'visible', fromMeters: [0, 0, 0], toMeters: [0, 0, 0] }] });
		const parsed = SceneGenerationPlanV1BodySchema.parse(candidate);
		expect(parsed.events[0]).toMatchObject({ status: 'hypothesis', reviewStatus: 'unreviewed', evidenceIds: [evidenceId], sourceEvent: null,
			action: { type: 'visible_during_interval', visible: true }, targetRefs: [{ kind: 'primitive', targetId: 'OBJECT-01' }] });
		expect(parsed.narrative.why.status).toBe('unknown');
		expect(parsed.environment.coordinateStatus).toBe('illustrative_uncalibrated');
	});

	it('preserves one source-clock event bound to multiple actors and props through edit and reopen', () => {
		const candidate = buildCaseScenePlanDraftV1({ caseId, sceneId, expectedSceneRevision: 0, parameters: params, environmentKind: 'urban', seed: 3,
			actors: [
				{ actorId: 'ACTOR-01', label: 'Person 01', appearance: 'Unidentified', evidenceIds: [] },
				{ actorId: 'ACTOR-02', label: 'Person 02', appearance: 'Unidentified', evidenceIds: [] }
			],
			objects: [{ objectId: 'OBJECT-01', registryId: 'box', label: 'Door', positionMeters: [1, 0, 0] }],
			events: [{ eventId: 'EVENT-GROUP-01', label: 'Several people move toward the exit', cueType: 'evacuate', sourceEvidenceId: evidenceId,
				startMs: 10_000, endMs: 15_000, uncertaintyMs: 500, targetKind: 'actor', targetId: 'ACTOR-01',
				additionalTargets: [{ kind: 'actor', targetId: 'ACTOR-02' }, { kind: 'primitive', targetId: 'OBJECT-01' }],
				action: 'move', fromMeters: [0, 0, 0], toMeters: [2, 0, 1] }]
		});
		expect(candidate.events[0]?.targetRefs).toEqual([
			{ kind: 'actor', targetId: 'ACTOR-01' }, { kind: 'actor', targetId: 'ACTOR-02' }, { kind: 'primitive', targetId: 'OBJECT-01' }
		]);
		expect(candidate.events[0]?.actorIds).toEqual(['ACTOR-01', 'ACTOR-02']);
		const restored = restoreCaseSceneDraftV1(candidate);
		expect(restored.events[0]?.additionalTargets).toEqual([
			{ kind: 'actor', targetId: 'ACTOR-02' }, { kind: 'primitive', targetId: 'OBJECT-01' }
		]);
		const rebuilt = buildCaseScenePlanDraftV1({ ...restored, caseId, sceneId, expectedSceneRevision: 1, parameters: params, environmentKind: restored.kind, seed: 3, basePlan: candidate });
		expect(rebuilt.events[0]?.targetRefs).toEqual(candidate.events[0]?.targetRefs);
		expect(rebuilt.events[0]?.clock).toEqual(candidate.events[0]?.clock);
	});

	it('rejects duplicate event target references', () => {
		expect(() => buildCaseScenePlanDraftV1({ caseId, sceneId, expectedSceneRevision: 0, parameters: params, environmentKind: 'urban', seed: 1,
			actors: [{ actorId: 'ACTOR-01', label: 'Person', appearance: 'Unidentified', evidenceIds: [] }], objects: [],
			events: [{ eventId: 'EVENT-DUP-01', label: 'Duplicate target', cueType: 'move', sourceEvidenceId: evidenceId, startMs: 0, endMs: 1000,
				uncertaintyMs: 0, targetKind: 'actor', targetId: 'ACTOR-01', additionalTargets: [{ kind: 'actor', targetId: 'ACTOR-01' }],
				action: 'move', fromMeters: [0, 0, 0], toMeters: [1, 0, 0] }]
		})).toThrow();
	});

	it('fails closed when a source hash is absent or the source was not in the validated response', () => {
		expect(() => buildCaseScenePlanDraftV1({ caseId, sceneId, expectedSceneRevision: 0, parameters: { ...params, sourceEvidence: [{ evidenceId, sha256: null, revisionVerified: false }] }, environmentKind: 'beach', seed: 1, actors: [], objects: [],
			events: [{ eventId: 'EVENT-01', label: 'report', cueType: 'custom', sourceEvidenceId: evidenceId, startMs: 0, endMs: 1000, uncertaintyMs: 0, targetKind: 'primitive', targetId: 'OBJECT-01', action: 'visible', fromMeters: [0, 0, 0], toMeters: [0, 0, 0] }] })).toThrow(/SOURCE_HASH_UNAVAILABLE/);
	});

	it('carries Why and How proposals as unreviewed and preserves unchanged canonical review references', () => {
		const proposalParameters = { ...params, brief: { ...params.brief,
			why: { status: 'hypothesis' as const, text: 'A cited motive proposal', evidenceIds: [evidenceId] },
			how: { status: 'hypothesis' as const, description: 'A cited method proposal', evidenceIds: [evidenceId] }
		} };
		const initial = buildCaseScenePlanDraftV1({ caseId, sceneId, expectedSceneRevision: 0, parameters: proposalParameters, environmentKind: 'beach', seed: 1, actors: [], objects: [], events: [] });
		expect(initial.narrative.why).toMatchObject({ status: 'hypothesis', reviewStatus: 'unreviewed', reviewDecisionId: null });
		expect(initial.narrative.how).toMatchObject({ status: 'hypothesis', reviewStatus: 'unreviewed', reviewDecisionId: null });
		const acceptedWhy = { ...initial.narrative.why, reviewStatus: 'accepted' as const, reviewDecisionId: '66666666-6666-4666-8666-666666666666' };
		const reviewedBase = { ...initial, narrative: { ...initial.narrative, why: acceptedWhy } };
		const next = buildCaseScenePlanDraftV1({ caseId, sceneId, expectedSceneRevision: 1, parameters: proposalParameters, environmentKind: 'beach', seed: 1, actors: [], objects: [], events: [], basePlan: reviewedBase });
		expect(next.narrative.why).toEqual(acceptedWhy);
	});

	it('restores an editable reviewed cue and carries its original placement into the next revision', () => {
		const candidate = buildCaseScenePlanDraftV1({
			caseId, sceneId, expectedSceneRevision: 0, parameters: params, environmentKind: 'beach', seed: 9,
			actors: [{ actorId: 'ACTOR-01', label: 'Placeholder', appearance: 'Unresolved', evidenceIds: [] }],
			objects: [{ objectId: 'OBJECT-01', registryId: 'cone', label: 'Prop', positionMeters: [2, 0, 3] }],
			events: [{ eventId: 'EVENT-01', label: 'Reviewed report', cueType: 'custom', sourceEvidenceId: evidenceId, startMs: 1000,
				endMs: 4000, uncertaintyMs: 100, targetKind: 'primitive', targetId: 'OBJECT-01', action: 'none',
				fromMeters: [0, 0, 0], toMeters: [2, 0, 0], sourceEvent: {
					sourceEvidenceId: evidenceId, sourceEventId: '55555555-5555-4555-8555-555555555555',
					analysisRevision: 'video-rev-1', startMs: 1000, endMs: 4000
				} }]
		});
		const restored = restoreCaseSceneDraftV1(candidate);
		expect(restored.evidenceIds).toEqual([evidenceId]);
		restored.objects[0]!.positionMeters = [4, 0, 3];
		const next = buildCaseScenePlanDraftV1({ ...restored, caseId, sceneId, expectedSceneRevision: 1, parameters: params,
			environmentKind: restored.kind, seed: 1, basePlan: candidate });
		expect(next.environment.seed).toBe(9);
		expect(next.placements[0]).toEqual(candidate.placements[0]);
		expect(next.placements[1]).toEqual({ ...candidate.placements[1], positionMeters: [4, 0, 3] });
		expect(next.events).toEqual(candidate.events);
		expect(next.expectedSceneRevision).toBe(1);
		expect(() => restoreCaseSceneDraftV1({ ...candidate, events: candidate.events.map((event) => ({
			...event, targetRefs: [...event.targetRefs, { kind: 'actor', targetId: 'ACTOR-01' }]
		})) })).toThrow('event outside the editor');
	});
});
