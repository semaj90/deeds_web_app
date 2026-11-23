import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSceneGenerationPlanV1 } from './scene-generation-plan-v1.js';
import { buildSceneGenerationJobKeysV1 } from './scene-generation-job-keys-v1.js';
import { readSceneGenerationInputStatusV1 } from './load-scene-generation-plan-v1.js';
import { claimSceneGenerationJobV1, completeSceneGenerationJobV1, stopStaleSceneGenerationJobV1 } from './scene-generation-job-lifecycle-v1.js';
import { compileSceneGenerationJobToSeaweedV1, compileSceneGenerationJobV1 } from './scene-generation-worker-v1.js';
import { runSceneGenerationJobV1 } from './run-scene-generation-job-v1.js';

vi.mock('./load-scene-generation-plan-v1.js', () => ({ readSceneGenerationInputStatusV1: vi.fn() }));
vi.mock('./scene-generation-job-lifecycle-v1.js', () => ({
	claimSceneGenerationJobV1: vi.fn(), completeSceneGenerationJobV1: vi.fn(), stopStaleSceneGenerationJobV1: vi.fn()
}));
vi.mock('./scene-generation-worker-v1.js', async (original) => ({
	...await original<typeof import('./scene-generation-worker-v1.js')>(),
	compileSceneGenerationJobToSeaweedV1: vi.fn()
}));

const caseId = '11111111-1111-4111-8111-111111111111';
const sceneId = '22222222-2222-4222-8222-222222222222';
const jobId = '33333333-3333-4333-8333-333333333333';
const dispatch = { caseId, sceneId, jobId, workerId: 'worker-1', leaseSeconds: 60 };
const plan = buildSceneGenerationPlanV1({
	schema: 'parent-atlas.scene-generation-plan/v1', caseId, sceneId, expectedSceneRevision: 0,
	generator: 'procedural-three-scene-v1', caseIntake: null,
	narrative: { why: { status: 'unknown' }, how: { status: 'unknown' } },
	sources: [], actors: [], primitives: [], placements: [], events: [],
	environment: { kind: 'indoor', seed: 7, cellSizeMeters: 32, extentMeters: { x: 32, z: 32 }, coordinateStatus: 'illustrative_uncalibrated' },
	quality: { profile: 'retro', maxTextureDimension: 128, maxTriangles: 50_000, maxInstances: 10_000, activeSceneMemoryMiB: 8 },
	provenance: { intakeStatus: 'USER_INTAKE_UNVERIFIED', clockPolicy: 'source_local_unaligned', identityPolicy: 'pseudonymous_visual_handles', motivePolicy: 'unknown_or_cited_hypothesis' }
});
const { job, requestSha256 } = buildSceneGenerationJobKeysV1({
	caseId, sceneId, expectedSceneRevision: 0, inputKind: 'BLOCKOUT', requestSnapshot: plan, sourceSnapshot: []
});

beforeEach(() => {
	vi.resetAllMocks();
	vi.mocked(claimSceneGenerationJobV1).mockResolvedValue({
		...job, requestSha256, jobId, createdBy: 7, attemptCount: 2
	} as NonNullable<Awaited<ReturnType<typeof claimSceneGenerationJobV1>>>);
	vi.mocked(readSceneGenerationInputStatusV1).mockResolvedValue('current');
	const objects = new Map<string, Uint8Array>();
	vi.mocked(compileSceneGenerationJobToSeaweedV1).mockImplementation((input) => compileSceneGenerationJobV1({
		...input,
		storage: {
			bucket: 'test-artifacts',
			async putIfAbsent(key, bytes) { objects.set(key, bytes.slice()); },
			async read(key) { return objects.get(key)!.slice(); }
		}
	}));
	vi.mocked(completeSceneGenerationJobV1).mockResolvedValue('completed');
	vi.mocked(stopStaleSceneGenerationJobV1).mockResolvedValue(true);
});

describe('scene generation dispatch', () => {
	it('compiles a claimed blockout with no evidence and supplies the lease attempt to completion', async () => {
		expect(await runSceneGenerationJobV1(dispatch)).toBe('completed');
		expect(readSceneGenerationInputStatusV1).toHaveBeenCalledWith(expect.objectContaining({ caseId, createdBy: 7 }));
		expect(compileSceneGenerationJobToSeaweedV1).toHaveBeenCalledWith({ snapshot: job, requestSha256 });
		expect(completeSceneGenerationJobV1).toHaveBeenCalledWith(expect.objectContaining({ jobId, attemptCount: 2 }));
	});

	it('never compiles a request whose case or sources are no longer available', async () => {
		vi.mocked(readSceneGenerationInputStatusV1).mockResolvedValueOnce('source_missing');
		expect(await runSceneGenerationJobV1(dispatch)).toBe('source_missing');
		expect(compileSceneGenerationJobToSeaweedV1).not.toHaveBeenCalled();
	});

	it('returns the final transaction’s stale-input outcome', async () => {
		vi.mocked(completeSceneGenerationJobV1).mockResolvedValueOnce('source_stale');
		expect(await runSceneGenerationJobV1(dispatch)).toBe('source_stale');
		expect(stopStaleSceneGenerationJobV1).not.toHaveBeenCalled();
	});
});
