import { describe, expect, it } from 'vitest';
import { buildSceneGenerationJobKeysV1 } from './scene-generation-job-keys-v1.js';
import { buildSceneGenerationPlanV1 } from './scene-generation-plan-v1.js';
import { canTransitionSceneGenerationJobV1 } from '$lib/reconstruction/scene-generation-job-contract-v1.js';
import { compileSceneGenerationJobV1 } from './compile-scene-generation-job-v1.js';

const caseId = '11111111-1111-4111-8111-111111111111';
const sceneId = '22222222-2222-4222-8222-222222222222';
const evidenceId = '33333333-3333-4333-8333-333333333333';
const source = { evidenceId, sourceRevision: `sha256:${'a'.repeat(64)}`, sha256: 'a'.repeat(64) };

function plan(expectedSceneRevision = 0, withEvidence = false) {
	return buildSceneGenerationPlanV1({
		schema: 'parent-atlas.scene-generation-plan/v1', caseId, sceneId, expectedSceneRevision,
		generator: 'procedural-three-scene-v1', caseIntake: null,
		narrative: { why: { status: 'unknown' }, how: { status: 'unknown' } },
		sources: withEvidence ? [{ evidenceId, sourceRevision: source.sourceRevision, sha256: source.sha256 }] : [],
		reviewedObservations: [], actors: [], primitives: [], assets: [], placements: [], events: [],
		environment: { kind: 'urban', seed: 7, cellSizeMeters: 32, extentMeters: { x: 320, z: 320 }, coordinateStatus: 'illustrative_uncalibrated' },
		quality: { profile: 'retro', maxTextureDimension: 128, maxTriangles: 50_000, maxInstances: 10_000, activeSceneMemoryMiB: 8 },
		provenance: { intakeStatus: 'USER_INTAKE_UNVERIFIED', clockPolicy: 'source_local_unaligned', identityPolicy: 'pseudonymous_visual_handles', motivePolicy: 'unknown_or_cited_hypothesis' }
	});
}

describe('scene generation job contract', () => {
	it('compiles the claimed snapshot into identical recipe bytes on replay', () => {
		const { job, requestSha256 } = buildSceneGenerationJobKeysV1({
			caseId, sceneId, expectedSceneRevision: 0, inputKind: 'BLOCKOUT', requestSnapshot: plan(), sourceSnapshot: []
		});
		const input = { snapshot: job, requestSha256 };
		const compiled = compileSceneGenerationJobV1(input);
		expect(compileSceneGenerationJobV1(input)).toEqual(compiled);
		expect(compiled.receipt).toMatchObject({
			caseId, sceneId, expectedSceneRevision: 0, requestSha256,
			planHash: job.requestSnapshot.planHash, byteLength: compiled.bytes.length, sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
		});
		expect(JSON.parse(compiled.bytes.toString('utf8'))).toMatchObject({ caseId, sceneId, eventLanes: [], assets: [] });
		expect(() => compileSceneGenerationJobV1({ ...input, requestSha256: '0'.repeat(64) })).toThrow('REQUEST_HASH_MISMATCH');
	});

	it('rejects a valid request hash carrying a forged plan hash or unresolved primitive', () => {
		const { planHash: _planHash, ...body } = plan();
		const forged = { ...body, planHash: '0'.repeat(64) };
		const missingPrimitive = buildSceneGenerationPlanV1({
			...body, primitives: [{ objectId: 'OBJECT-01', registryId: 'missing-primitive' }]
		});
		for (const [requestSnapshot, error] of [[forged, 'PLAN_HASH_MISMATCH'], [missingPrimitive, 'UNKNOWN_PRIMITIVE']] as const) {
			const { job, requestSha256 } = buildSceneGenerationJobKeysV1({
				caseId, sceneId, expectedSceneRevision: 0, inputKind: 'BLOCKOUT', requestSnapshot, sourceSnapshot: []
			});
			expect(() => compileSceneGenerationJobV1({ snapshot: job, requestSha256 })).toThrow(error);
		}
	});

	it('admits an evidence-free blockout with a validated plan and no fabricated evidence ID', () => {
		const result = buildSceneGenerationJobKeysV1({ caseId, sceneId, expectedSceneRevision: 0, inputKind: 'BLOCKOUT', requestSnapshot: plan(), sourceSnapshot: [] });
		expect(result.job.sourceSnapshot).toEqual([]);
		expect(result.requestSha256).toMatch(/^[0-9a-f]{64}$/);
		expect(result.idempotencyKey).toMatch(/^[0-9a-f]{64}$/);
	});

	it('rejects fake or incomplete evidence bindings and plan scope mismatches', () => {
		const base = { caseId, sceneId, expectedSceneRevision: 0, requestSnapshot: plan() };
		expect(() => buildSceneGenerationJobKeysV1({ ...base, inputKind: 'BLOCKOUT', sourceSnapshot: [source] })).toThrow();
		expect(() => buildSceneGenerationJobKeysV1({ ...base, inputKind: 'EVIDENCE_BACKED', sourceSnapshot: [source] })).toThrow();
		expect(() => buildSceneGenerationJobKeysV1({ ...base, requestSnapshot: plan(1), inputKind: 'BLOCKOUT', sourceSnapshot: [] })).toThrow();
		const evidencePlan = plan(0, true);
		expect(() => buildSceneGenerationJobKeysV1({ ...base, requestSnapshot: evidencePlan, inputKind: 'EVIDENCE_BACKED', sourceSnapshot: [source, source] })).toThrow();
	});

	it('changes idempotency when scene revision or validated plan changes', () => {
		const one = buildSceneGenerationJobKeysV1({ caseId, sceneId, expectedSceneRevision: 2, inputKind: 'EVIDENCE_BACKED', requestSnapshot: plan(2, true), sourceSnapshot: [source] });
		const same = buildSceneGenerationJobKeysV1({ caseId, sceneId, expectedSceneRevision: 2, inputKind: 'EVIDENCE_BACKED', requestSnapshot: plan(2, true), sourceSnapshot: [source] });
		const nextRevision = buildSceneGenerationJobKeysV1({ caseId, sceneId, expectedSceneRevision: 3, inputKind: 'EVIDENCE_BACKED', requestSnapshot: plan(3, true), sourceSnapshot: [source] });
		expect(same).toEqual(one);
		expect(nextRevision.idempotencyKey).not.toBe(one.idempotencyKey);
	});

	it('allows bounded retries and treats terminal states as non-retryable', () => {
		expect(canTransitionSceneGenerationJobV1({ from: 'running', to: 'queued', attemptCount: 1, maxAttempts: 3 })).toBe(true);
		expect(canTransitionSceneGenerationJobV1({ from: 'queued', to: 'running', attemptCount: 2, maxAttempts: 3 })).toBe(true);
		expect(canTransitionSceneGenerationJobV1({ from: 'queued', to: 'running', attemptCount: 3, maxAttempts: 3 })).toBe(false);
		expect(canTransitionSceneGenerationJobV1({ from: 'failed', to: 'queued', attemptCount: 3, maxAttempts: 3 })).toBe(false);
		expect(canTransitionSceneGenerationJobV1({ from: 'source_missing', to: 'queued', attemptCount: 1, maxAttempts: 3 })).toBe(true);
		for (const from of ['completed', 'canceled', 'source_stale'] as const) {
			expect(canTransitionSceneGenerationJobV1({ from, to: 'queued', attemptCount: 0, maxAttempts: 3 })).toBe(false);
		}
	});
});
