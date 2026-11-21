import { describe, expect, it } from 'vitest';
import { resolveSceneGenerationPlanReferencesV1, SceneGenerationPlanResolutionErrorV1 } from './resolve-scene-generation-plan-v1.js';

const caseId = '44444444-4444-4444-8444-444444444444';
const sceneId = '33333333-3333-4333-8333-333333333333';
const evidenceId = '11111111-1111-4111-8111-111111111111';
const sourceSha = 'a'.repeat(64);
const sourceRevision = `sha256:${sourceSha}`;
const reviewDecisionId = '55555555-5555-4555-8555-555555555555';
const observationId = `sha256:${'c'.repeat(64)}`;
const observationRevision = `sha256:${'b'.repeat(64)}`;
const intake = { schema: 'parent-atlas.case-scene-intake/v1' as const, status: 'USER_INTAKE_UNVERIFIED' as const, who: 'user supplied', what: null, when: null, where: null, why: 'unknown', how: null };

const candidate = {
	schema: 'parent-atlas.scene-generation-plan/v1', caseId, sceneId, expectedSceneRevision: 3, generator: 'procedural-three-scene-v1',
	caseIntake: null, narrative: { why: { status: 'unknown' }, how: { status: 'unknown' } },
	sources: [{ evidenceId, sourceRevision, sha256: sourceSha }],
	reviewedObservations: [{ observationId, evidenceId, sourceRevision, sourceSha256: sourceSha, analysisRevision: 'analysis-7', observationRevision, reviewDecisionId, reviewStatus: 'accepted' }],
	actors: [], primitives: [], assets: [], placements: [], events: [],
	environment: { kind: 'urban', seed: 9, cellSizeMeters: 32, extentMeters: { x: 320, z: 320 }, coordinateStatus: 'illustrative_uncalibrated' },
	quality: { profile: 'retro', maxTextureDimension: 128, maxTriangles: 100, maxInstances: 10, activeSceneMemoryMiB: 8 },
	provenance: { intakeStatus: 'USER_INTAKE_UNVERIFIED', clockPolicy: 'source_local_unaligned', identityPolicy: 'pseudonymous_visual_handles', motivePolicy: 'unknown_or_cited_hypothesis' }
} as const;

const base = {
	caseId, currentSceneRevision: 3, caseIntake: intake, candidate,
	evidenceRows: [{ id: evidenceId, caseId, deletedAt: null, hash: sourceRevision }],
	observationReviews: [{ caseId, evidenceId, sourceRevision, analysisRevision: 'analysis-7', observationRevision, observationId, reviewDecisionId, decision: 'ACCEPTED' as const }],
	videoEvents: []
};

describe('scene generation plan canonical resolution', () => {
	it('pins stored intake and hashes only references matching current case, scene and evidence revisions', () => {
		const withEvent = { ...candidate, events: [{ eventId: 'EVENT-01', cueType: 'enter', label: 'Person appears', status: 'hypothesis', reviewStatus: 'unreviewed', evidenceIds: [evidenceId], actorIds: [], clock: { evidenceId, clockId: 'CLIENT-CLOCK-CAN-MERGE', startMs: 1000, endMs: 2000, uncertaintyMs: 100 } }] };
		const plan = resolveSceneGenerationPlanReferencesV1({ ...base, candidate: withEvent });
		expect(plan.caseIntake).toEqual(intake);
		expect(plan.planHash).toMatch(/^[a-f0-9]{64}$/);
		expect(plan.events[0]?.clock.clockId).toBe(`evidence:${evidenceId}`);
	});

	it('rejects cross-case, stale scene, stale source, deleted and unselected evidence', () => {
		expect(() => resolveSceneGenerationPlanReferencesV1({ ...base, caseId: '66666666-6666-4666-8666-666666666666' })).toThrow('PLAN_CASE_SCOPE_MISMATCH');
		expect(() => resolveSceneGenerationPlanReferencesV1({ ...base, currentSceneRevision: 4 })).toThrow('SCENE_REVISION_STALE');
		expect(() => resolveSceneGenerationPlanReferencesV1({ ...base, evidenceRows: [{ ...base.evidenceRows[0], hash: `sha256:${'d'.repeat(64)}` }] })).toThrow('SOURCE_REVISION_STALE');
		expect(() => resolveSceneGenerationPlanReferencesV1({ ...base, evidenceRows: [{ ...base.evidenceRows[0], deletedAt: '2026-01-01T00:00:00Z' }] })).toThrow('SOURCE_NOT_AUTHORIZED');
		expect(() => resolveSceneGenerationPlanReferencesV1({ ...base, evidenceRows: [] })).toThrow('SOURCE_MEMBERSHIP_MISMATCH');
	});

	it('requires the current canonical accepted observation decision and fails closed for unowned narrative review', () => {
		expect(() => resolveSceneGenerationPlanReferencesV1({ ...base, observationReviews: [] })).toThrow('OBSERVATION_REVIEW_NOT_CURRENTLY_ACCEPTED');
		const withProposal = { ...candidate, narrative: { ...candidate.narrative, why: { status: 'hypothesis', text: 'A proposed motive', evidenceIds: [evidenceId] } } };
		expect(resolveSceneGenerationPlanReferencesV1({ ...base, candidate: withProposal }).narrative.why.status).toBe('hypothesis');
		const withAcceptedClaim = { ...candidate, narrative: { ...candidate.narrative, why: { status: 'hypothesis', text: 'A proposed motive', evidenceIds: [evidenceId], reviewStatus: 'accepted', reviewDecisionId } } };
		expect(() => resolveSceneGenerationPlanReferencesV1({ ...base, candidate: withAcceptedClaim })).toThrow('NARRATIVE_REVIEW_OWNER_UNAVAILABLE');
	});

	it('does not accept measured or reviewed events without canonical video-event admission', () => {
		const measured = { ...candidate, events: [{ eventId: 'EVENT-01', cueType: 'enter', label: 'Entry', status: 'measured', reviewStatus: 'accepted', evidenceIds: [evidenceId], clock: { evidenceId, clockId: 'CAM-A', startMs: 1000, endMs: 2000, uncertaintyMs: 0 }, sourceEvent: { sourceEvidenceId: evidenceId, sourceEventId: '77777777-7777-4777-8777-777777777777', analysisRevision: 'analysis-7', startMs: 1000, endMs: 2000 } }] };
		const videoEvents = [{ caseId, evidenceId, sourceRevision, analysisRevision: 'analysis-7', eventId: '77777777-7777-4777-8777-777777777777', startMs: 1000, endMs: 2000, reviewStatus: 'APPROVED' as const, sceneAdmission: 'APPROVED_FOR_SCENE_PROPOSAL' as const }];
		const unapproved = [{ ...videoEvents[0], reviewStatus: 'UNREVIEWED_PROPOSAL' as const, sceneAdmission: 'NOT_ADMITTED' as const }];
		expect(() => resolveSceneGenerationPlanReferencesV1({ ...base, candidate: measured, videoEvents: unapproved })).toThrow('SOURCE_EVENT_NOT_ADMITTED');
		expect(resolveSceneGenerationPlanReferencesV1({ ...base, candidate: measured, videoEvents })).toMatchObject({ events: [{ status: 'measured' }] });
	});
});
