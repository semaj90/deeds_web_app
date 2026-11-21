import { describe, expect, it, vi } from 'vitest';
import { buildSceneGenerationPlanV1 } from './scene-generation-plan-v1.js';
import { buildSceneGenerationJobKeysV1 } from './scene-generation-job-keys-v1.js';
import { compileSceneGenerationJobToSeaweedV1, compileSceneGenerationJobV1 } from './scene-generation-worker-v1.js';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { seaweed } from '$lib/server/storage/seaweed.js';
import { storageBuckets } from '$lib/server/storage/storage-buckets.js';

const caseId = '44444444-4444-4444-8444-444444444444';
const sceneId = '33333333-3333-4333-8333-333333333333';
const evidenceId = '11111111-1111-4111-8111-111111111111';
const sourceHash = 'a'.repeat(64);
const sourceRevision = `sha256:${sourceHash}`;
const observationRevision = `sha256:${'b'.repeat(64)}`;
const reviewDecisionId = '55555555-5555-4555-8555-555555555555';

const basePlan = {
	schema: 'parent-atlas.scene-generation-plan/v1',
	caseId,
	sceneId,
	expectedSceneRevision: 1,
	generator: 'procedural-three-scene-v1',
	caseIntake: {
		schema: 'parent-atlas.case-scene-intake/v1',
		status: 'USER_INTAKE_UNVERIFIED',
		who: 'Several unidentified people',
		what: 'Alleged incident',
		when: 'Around 10 AM',
		where: 'North Quay',
		why: 'Unknown',
		how: 'Unclear'
	},
	narrative: { why: { status: 'unknown' }, how: { status: 'unknown' } },
	sources: [{ evidenceId, sourceRevision, sha256: sourceHash }],
	reviewedObservations: [
		{
			observationId: `sha256:${'c'.repeat(64)}`,
			evidenceId,
			sourceRevision,
			sourceSha256: sourceHash,
			analysisRevision: 'analysis-7',
			observationRevision,
			reviewDecisionId,
			reviewStatus: 'accepted'
		}
	],
	actors: [{ actorId: 'ACTOR-01', label: 'Unidentified person', evidenceIds: [evidenceId] }],
	primitives: [{ objectId: 'OBJECT-01', registryId: 'box' }],
	assets: [],
	placements: [
		{
			placementId: 'PLACEMENT-ACTOR-01',
			targetKind: 'actor',
			targetId: 'ACTOR-01',
			positionMeters: [0, 0, 0],
			rotationQuaternion: [0, 0, 0, 1],
			scale: [1, 1, 1]
		},
		{
			placementId: 'PLACEMENT-DESK-01',
			targetKind: 'primitive',
			targetId: 'OBJECT-01',
			positionMeters: [2, 0, 1],
			rotationQuaternion: [0, 0, 0, 1],
			scale: [1, 1, 1]
		}
	],
	events: [
		{
			eventId: 'EVENT-01',
			cueType: 'enter',
			label: 'Person appears at entrance',
			status: 'hypothesis',
			reviewStatus: 'unreviewed',
			evidenceIds: [evidenceId],
			actorIds: ['ACTOR-01'],
			clock: { evidenceId, clockId: `evidence:${evidenceId}`, startMs: 1000, endMs: 3000, uncertaintyMs: 250 }
		}
	],
	environment: {
		kind: 'urban',
		seed: 1234,
		cellSizeMeters: 32,
		extentMeters: { x: 320, z: 320 },
		coordinateStatus: 'illustrative_uncalibrated'
	},
	quality: {
		profile: 'retro',
		maxTextureDimension: 128,
		maxTriangles: 50_000,
		maxInstances: 10_000,
		activeSceneMemoryMiB: 8
	},
	provenance: {
		intakeStatus: 'USER_INTAKE_UNVERIFIED',
		clockPolicy: 'source_local_unaligned',
		identityPolicy: 'pseudonymous_visual_handles',
		motivePolicy: 'unknown_or_cited_hypothesis'
	}
} as const;

function memoryStorage() {
	const objects = new Map<string, Uint8Array>();
	return {
		bucket: 'test-artifacts',
		putIfAbsent: vi.fn(async (key: string, bytes: Uint8Array) => {
			if (!objects.has(key)) objects.set(key, Uint8Array.from(bytes));
		}),
		read: vi.fn(async (key: string, maximumBytes: number) => {
			const bytes = objects.get(key);
			if (!bytes || bytes.length > maximumBytes) throw new Error('Invalid stored object');
			return Uint8Array.from(bytes);
		})
	};
}

function workerInput(withEvidence: boolean) {
	const plan = buildSceneGenerationPlanV1(
		withEvidence
			? basePlan
			: {
					...basePlan,
					sources: [],
					reviewedObservations: [],
					actors: [],
					events: [],
					placements: basePlan.placements.filter((placement) => placement.targetKind === 'primitive')
				}
	);
	const { job, requestSha256 } = buildSceneGenerationJobKeysV1({
		caseId,
		sceneId,
		expectedSceneRevision: 1,
		inputKind: withEvidence ? 'EVIDENCE_BACKED' : 'BLOCKOUT',
		requestSnapshot: plan,
		sourceSnapshot: withEvidence ? [{ evidenceId, sourceRevision, sha256: sourceHash }] : []
	});
	return { snapshot: job, requestSha256, storage: memoryStorage() };
}

describe('scene generation worker artifact handoff', () => {
	it('uses a conditional SeaweedFS put and bounded GET, including when the object already exists', async () => {
		const input = workerInput(false);
		for (const existing of [false, true]) {
			const send = vi.spyOn(seaweed, 'send');
			try {
				if (existing) send.mockRejectedValueOnce({ $metadata: { httpStatusCode: 412 } });
				else send.mockResolvedValueOnce({} as never);
				send.mockImplementationOnce(async (command: GetObjectCommand) => {
					expect(command).toBeInstanceOf(GetObjectCommand);
					const put = send.mock.calls[0]?.[0];
					expect(put).toBeInstanceOf(PutObjectCommand);
					expect(put?.input).toMatchObject({ Bucket: storageBuckets.artifacts, IfNoneMatch: '*', Key: command.input.Key });
					expect(command.input.Bucket).toBe(storageBuckets.artifacts);
					return { Body: Readable.from([(put as PutObjectCommand).input.Body]) };
				});
				const { resultRefs } = await compileSceneGenerationJobToSeaweedV1({ snapshot: input.snapshot, requestSha256: input.requestSha256 });
				expect(resultRefs[0]?.bucket).toBe(storageBuckets.artifacts);
				expect(send).toHaveBeenCalledTimes(2);
			} finally {
				send.mockRestore();
			}
		}
	});

	it('publishes a case-scoped recipe and preserves source clocks and placements', async () => {
		const input = workerInput(true);
		const result = await compileSceneGenerationJobV1(input);
		expect(result.manifest).toMatchObject({ caseId, sceneId, placementCount: 2, eventCueCount: 1 });
		const [ref] = result.resultRefs;
		expect(ref).toMatchObject({ kind: 'SCENE_RUNTIME_RECIPE_V1', mimeType: 'application/json' });
		expect(ref!.artifactKey).toBe(`scene-generation/${caseId}/${sceneId}/sha256/${ref!.sha256}.json`);
		expect(input.storage.read).toHaveBeenCalledWith(ref!.artifactKey, ref!.byteLength);
		const stored = await input.storage.read(ref!.artifactKey, ref!.byteLength);
		expect(JSON.parse(Buffer.from(stored).toString('utf8'))).toMatchObject({
			eventLanes: [{ evidenceId, clockId: `evidence:${evidenceId}` }],
			placements: expect.arrayContaining([expect.objectContaining({ targetId: 'OBJECT-01' })])
		});
	});

	it('replays an evidence-free blockout with identical artifact and manifest hashes', async () => {
		const input = workerInput(false);
		const first = await compileSceneGenerationJobV1(input);
		expect(await compileSceneGenerationJobV1(input)).toEqual(first);
	});

	it('rejects corrupted readback even when the byte length is correct', async () => {
		const input = workerInput(true);
		input.storage.read.mockImplementation(async (_key, maximumBytes) => new Uint8Array(maximumBytes));
		await expect(compileSceneGenerationJobV1(input)).rejects.toThrow('SCENE_GENERATION_RECIPE_READBACK_MISMATCH');
	});

	it('rejects a changed request hash before touching storage', async () => {
		const input = workerInput(true);
		await expect(compileSceneGenerationJobV1({ ...input, requestSha256: '0'.repeat(64) })).rejects.toThrow('REQUEST_HASH_MISMATCH');
		expect(input.storage.putIfAbsent).not.toHaveBeenCalled();
	});
});
