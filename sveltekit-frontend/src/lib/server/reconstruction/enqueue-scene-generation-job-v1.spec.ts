import { describe, expect, it, vi } from 'vitest';
import type { db } from '$lib/server/db/client.js';
import { buildSceneGenerationPlanV1 } from './scene-generation-plan-v1.js';
import { enqueueSceneGenerationJobV1 } from './enqueue-scene-generation-job-v1.js';
import { loadSceneGenerationPlanV1 } from './load-scene-generation-plan-v1.js';

vi.mock('./load-scene-generation-plan-v1.js', async (original) => ({
	...await original<typeof import('./load-scene-generation-plan-v1.js')>(),
	loadSceneGenerationPlanV1: vi.fn()
}));

const caseId = '11111111-1111-4111-8111-111111111111';
const sceneId = '22222222-2222-4222-8222-222222222222';
const jobId = '33333333-3333-4333-8333-333333333333';
const actorId = 7;
const plan = buildSceneGenerationPlanV1({
	schema: 'parent-atlas.scene-generation-plan/v1', caseId, sceneId, expectedSceneRevision: 0,
	generator: 'procedural-three-scene-v1', caseIntake: null,
	narrative: { why: { status: 'unknown' }, how: { status: 'unknown' } },
	sources: [], actors: [], primitives: [], placements: [], events: [],
	environment: { kind: 'indoor', seed: 7, cellSizeMeters: 32, extentMeters: { x: 32, z: 32 }, coordinateStatus: 'illustrative_uncalibrated' },
	quality: { profile: 'retro', maxTextureDimension: 128, maxTriangles: 50_000, maxInstances: 10_000, activeSceneMemoryMiB: 8 },
	provenance: { intakeStatus: 'USER_INTAKE_UNVERIFIED', clockPolicy: 'source_local_unaligned', identityPolicy: 'pseudonymous_visual_handles', motivePolicy: 'unknown_or_cited_hypothesis' }
});

function transactionFixture(replay = false) {
	const returning = vi.fn().mockResolvedValue(replay ? [] : [{ jobId, status: 'queued' }]);
	const values = vi.fn((_row: { requestSha256?: string }) => ({ onConflictDoNothing: () => ({ returning }) }));
	const limit = vi.fn(async () => [{ jobId, status: 'completed', requestSha256: values.mock.calls[0]?.[0]?.requestSha256 }]);
	const tx = { insert: vi.fn(() => ({ values })), select: () => ({ from: () => ({ where: () => ({ limit }) }) }) };
	const transaction = vi.fn((run: (tx: unknown) => Promise<unknown>) => run(tx));
	return { database: { transaction } as unknown as Pick<typeof db, 'transaction'>, transaction, tx, values };
}

describe('scene generation enqueue', () => {
	it('revalidates and inserts a blockout and its initial event in one transaction', async () => {
		const fixture = transactionFixture();
		vi.mocked(loadSceneGenerationPlanV1).mockResolvedValueOnce(plan);
		expect(await enqueueSceneGenerationJobV1({ caseId, actorId, plan }, fixture.database)).toEqual({ jobId, status: 'queued', replayed: false });
		expect(loadSceneGenerationPlanV1).toHaveBeenLastCalledWith(expect.objectContaining({ caseId, actorId }), fixture.tx);
		expect(fixture.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'serializable' });
		expect(fixture.values).toHaveBeenNthCalledWith(1, expect.objectContaining({ caseId, createdBy: actorId, inputKind: 'BLOCKOUT', sourceSnapshot: [] }));
		expect(fixture.values).toHaveBeenNthCalledWith(2, expect.objectContaining({ jobId, sequence: 1, toStatus: 'queued' }));
	});

	it('returns the existing job on replay without appending a duplicate event', async () => {
		const fixture = transactionFixture(true);
		vi.mocked(loadSceneGenerationPlanV1).mockResolvedValueOnce(plan);
		expect(await enqueueSceneGenerationJobV1({ caseId, actorId, plan }, fixture.database)).toEqual({ jobId, status: 'completed', replayed: true });
		expect(fixture.values).toHaveBeenCalledTimes(1);
	});

	it('rejects a changed preview or denied case before attempting an insert', async () => {
		const fixture = transactionFixture();
		vi.mocked(loadSceneGenerationPlanV1).mockResolvedValueOnce(plan).mockRejectedValueOnce(new Error('Case not found'));
		await expect(enqueueSceneGenerationJobV1({ caseId, actorId, plan: { ...plan, planHash: '0'.repeat(64) } }, fixture.database)).rejects.toThrow('preview changed');
		await expect(enqueueSceneGenerationJobV1({ caseId, actorId, plan }, fixture.database)).rejects.toThrow('Case not found');
		expect(fixture.tx.insert).not.toHaveBeenCalled();
	});
});
