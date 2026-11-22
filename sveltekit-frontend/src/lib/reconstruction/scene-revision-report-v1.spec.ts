import { describe, expect, it } from 'vitest';
import { buildSceneRevisionReportV1, serializeSceneRevisionReportV1 } from './scene-revision-report-v1.js';
import { createSceneQualityReceiptV1, stableStringifySceneDocumentV1 } from '$lib/splat/scene-document-v1.js';
import { sha256Hex } from '$lib/splat/spz-loader.js';
import { SceneGenerationPlanV1Schema } from './scene-generation-plan-v1.js';

const caseId = '11111111-1111-4111-8111-111111111111';
const sceneId = '22222222-2222-4222-8222-222222222222';
const objectId = '33333333-3333-4333-8333-333333333333';

async function input(overrides: Record<string, unknown> = {}) {
	const manifest = {
		schema: 'parent-atlas.scene-document.v1' as const, sceneId, caseId, status: 'HYPOTHESIS' as const,
		revision: 2, parentManifestSha256: 'a'.repeat(64),
		createdAt: '2026-11-20T20:00:00.000Z', coordinateFrame: 'LOCAL_UNCALIBRATED' as const,
		objects: [{ objectId, parentObjectId: null, name: 'Bonfire proxy', kind: 'MESH' as const, assetSha256: null,
			transform: { translation: [1, 0, 2], rotationXyzw: [0, 0, 0, 1], scale: [1, 1, 1] },
			geometry: { meshCount: 1, vertexCount: 8, triangleCount: 12, textureCount: 0, boneCount: 0 } }],
		animations: [], evidenceBindings: [], evidenceSources: [], sceneTimelineCues: [], assets: [],
		quality: createSceneQualityReceiptV1({ derivedAssetBytes: 0, triangleCount: 12 }),
		...overrides
	};
	const manifestSha256 = await sha256Hex(new TextEncoder().encode(stableStringifySceneDocumentV1(manifest)));
	return { manifest, manifestSha256 };
}

describe('scene revision report v1', () => {
	it('exports only a revision-hash-bound scene snapshot and states its limitations', async () => {
		const report = await buildSceneRevisionReportV1(await input());
		expect(report).toMatchObject({ caseId, sceneId, revision: 2, reportKind: 'illustrative_scene_review', manifestSha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
		expect(report.objects[0]).toMatchObject({ objectId, name: 'Bonfire proxy' });
		expect(report.limitations).toContain('Source clock lanes are reported independently; no clock alignment is inferred by this export.');
		expect(JSON.parse(serializeSceneRevisionReportV1(report))).toEqual(report);
	});

	it('rejects altered or wrong-scope reports instead of exporting unverifiable bytes', async () => {
		const data = await input();
		await expect(buildSceneRevisionReportV1({ ...data, manifestSha256: 'b'.repeat(64) })).rejects.toThrow('SCENE_REPORT_MANIFEST_HASH_MISMATCH');
		await expect(buildSceneRevisionReportV1({ manifest: { ...data.manifest, caseId: null }, manifestSha256: data.manifestSha256 })).rejects.toThrow();
	});

	it('keeps approved events on their original independent source clocks', async () => {
		const evidenceA = '44444444-4444-4444-8444-444444444444';
		const evidenceB = '55555555-5555-4555-8555-555555555555';
		const hashA = 'c'.repeat(64);
		const hashB = 'd'.repeat(64);
		const data = await input({
			evidenceBindings: [{ evidenceId: evidenceA, sourceRevision: `sha256:${hashA}` }, { evidenceId: evidenceB, sourceRevision: `sha256:${hashB}` }],
			videoEventBindings: [
				{ evidenceId: evidenceA, sourceRevision: `sha256:${hashA}`, analysisRevision: 'analysis-a', eventId: '66666666-6666-4666-8666-666666666666', startMs: 1_000, endMs: 2_000, reviewState: 'APPROVED_FOR_SCENE_PROPOSAL', sourceClock: { clockId: 'CAM-A', timeBasis: 'MEDIA_ELAPSED', uncertaintyMs: 40 } },
				{ evidenceId: evidenceB, sourceRevision: `sha256:${hashB}`, analysisRevision: 'analysis-b', eventId: '77777777-7777-4777-8777-777777777777', startMs: 3_000, endMs: 4_000, reviewState: 'APPROVED_FOR_SCENE_PROPOSAL', sourceClock: { clockId: 'CAM-B', timeBasis: 'SOURCE_WALL_CLOCK', uncertaintyMs: 250 } }
			]
		});
		const report = await buildSceneRevisionReportV1(data);
		expect(report.approvedSourceEvents.map(({ clockId, timeBasis }) => [clockId, timeBasis])).toEqual([
			['CAM-A', 'MEDIA_ELAPSED'], ['CAM-B', 'SOURCE_WALL_CLOCK']
		]);
		expect(report.sourceEvidence).toHaveLength(2);
		expect(report.approvedSourceEvents.map(({ uncertaintyMs }) => uncertaintyMs)).toEqual([40, 250]);
	});

	it('exports saved procedural placements and connects a cue and annotation to the reviewed source event', async () => {
		const evidenceId = '44444444-4444-4444-8444-444444444444';
		const sha256 = 'c'.repeat(64);
		const sourceRevision = `sha256:${sha256}`;
		const evidenceBindings = [{ evidenceId, sourceRevision }];
		const sourceEvent = { sourceEvidenceId: evidenceId, sourceEventId: objectId, analysisRevision: 'analysis-a', startMs: 1000, endMs: 2000 };
		const primitive = { objectId: 'OBJECT-01', registryId: 'box' };
		const placement = {
			placementId: 'PLACEMENT-01', targetKind: 'primitive', targetId: primitive.objectId,
			positionMeters: [1, 0, 2], rotationQuaternion: [0, 0, 0, 1], scale: [1, 2, 1]
		};
		const plan = SceneGenerationPlanV1Schema.parse({
			schema: 'parent-atlas.scene-generation-plan/v1', caseId, sceneId, expectedSceneRevision: 1,
			generator: 'procedural-three-scene-v1', caseIntake: null, planHash: 'd'.repeat(64),
			narrative: { why: { status: 'unknown' }, how: { status: 'unknown' } },
			sources: [{ evidenceId, sourceRevision, sha256 }],
			actors: [], primitives: [primitive], placements: [placement],
			events: [{
				eventId: 'EVENT-01', cueType: 'custom', label: 'Reported activity near a prop',
				status: 'hypothesis', reviewStatus: 'accepted', evidenceIds: [evidenceId],
				cameraPreset: 'top-down',
				targetRefs: [{ kind: 'primitive', targetId: primitive.objectId }],
				clock: { evidenceId, clockId: `evidence:${evidenceId}`, startMs: 1000, endMs: 2000, uncertaintyMs: 40 },
				sourceEvent
			}],
			environment: { kind: 'four-bedroom-house', seed: 1, cellSizeMeters: 32,
				extentMeters: { x: 32, z: 32 }, coordinateStatus: 'illustrative_uncalibrated' },
			quality: { profile: 'retro', maxTextureDimension: 128, maxTriangles: 100_000, maxInstances: 20_000, activeSceneMemoryMiB: 8 },
			provenance: { intakeStatus: 'USER_INTAKE_UNVERIFIED', clockPolicy: 'source_local_unaligned',
				identityPolicy: 'pseudonymous_visual_handles', motivePolicy: 'unknown_or_cited_hypothesis' }
		});
		const note = { id: objectId, eventId: 'EVENT-01', sourceTimeMs: 1300, text: 'Check the source interval', objectId: primitive.objectId };
		const report = await buildSceneRevisionReportV1(await input({
			evidenceBindings, proceduralPreviewDraft: { schema: 'parent-atlas.scene-preview-draft/v1', plan, annotations: [note] }
		}));
		expect(report.proceduralGeometry).toMatchObject({ environment: plan.environment, primitives: [primitive], placements: [placement] });
		expect(report.plannedEvents[0]).toMatchObject({ eventId: note.eventId, sourceEvent, targetRefs: plan.events[0].targetRefs, cameraPreset: 'top-down' });
		expect(report.annotations).toEqual([note]);
	});
});
