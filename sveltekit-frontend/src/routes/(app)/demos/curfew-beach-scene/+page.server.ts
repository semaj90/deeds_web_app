import type { PageServerLoad } from './$types';
import { createHash } from 'node:crypto';
import { CURFEW_BEACH_CASE_FIXTURE_V1 } from '$lib/server/reconstruction/fixtures/curfew-beach-case-v1.js';
import { buildSceneGenerationPlanV1 } from '$lib/server/reconstruction/scene-generation-plan-v1.js';
import {
	attachModularPrefabAssemblyToRecipeV1,
	compileSceneRuntimeRecipeV1
} from '$lib/reconstruction/scene-runtime-recipe-v1.js';
import { createSceneDocumentV1, createSceneQualityReceiptV1, stableStringifySceneDocumentV1 } from '$lib/splat/scene-document-v1.js';

const DEMO_CASE_ID = '11111111-1111-4111-8111-111111111111';
const DEMO_SCENE_ID = '22222222-2222-4222-8222-222222222222';
const DEMO_EVIDENCE_ID = '33333333-3333-4333-8333-333333333333';
const DEMO_HASH = 'a'.repeat(64);

const demoPlan = buildSceneGenerationPlanV1({
	schema: 'parent-atlas.scene-generation-plan/v1',
	caseId: DEMO_CASE_ID,
	sceneId: DEMO_SCENE_ID,
	expectedSceneRevision: 1,
	generator: 'procedural-three-scene-v1',
	caseIntake: null,
	narrative: { why: { status: 'unknown' }, how: { status: 'unknown' } },
	sources: [{ evidenceId: DEMO_EVIDENCE_ID, sourceRevision: `sha256:${DEMO_HASH}`, sha256: DEMO_HASH }],
	reviewedObservations: [],
	actors: [
		{
			actorId: 'ACTOR-01',
			label: 'Synthetic Actor A (Retro GLB)',
			appearance: 'Synthetic demonstration character A',
			evidenceIds: [DEMO_EVIDENCE_ID]
		},
		{
			actorId: 'ACTOR-02',
			label: 'Synthetic Actor B (Retro GLB)',
			appearance: 'Synthetic demonstration character B',
			evidenceIds: [DEMO_EVIDENCE_ID]
		}
	],
	primitives: [{ objectId: 'OBJECT-01', registryId: 'box' }],
	assets: [],
	placements: [
		{
			placementId: 'PLACEMENT-ACTOR-01',
			targetKind: 'actor',
			targetId: 'ACTOR-01',
			positionMeters: [-2, 0, 0],
			rotationQuaternion: [0, 0, 0, 1],
			scale: [2.2, 2.2, 2.2]
		},
		{
			placementId: 'PLACEMENT-ACTOR-02',
			targetKind: 'actor',
			targetId: 'ACTOR-02',
			positionMeters: [2, 0, -1],
			rotationQuaternion: [0, 0, 0, 1],
			scale: [2.2, 2.2, 2.2]
		},
		{
			placementId: 'PLACEMENT-PROP-01',
			targetKind: 'primitive',
			targetId: 'OBJECT-01',
			positionMeters: [0, 0.5, -2],
			rotationQuaternion: [0, 0, 0, 1],
			scale: [1.5, 1.5, 1.5]
		}
	],
	events: [
		{
			eventId: 'EVENT-WALK-01',
			cameraPreset: 'top-down',
			cueType: 'move',
			label: 'Synthetic Actor A walk interval',
			status: 'hypothesis',
			reviewStatus: 'unreviewed',
			evidenceIds: [DEMO_EVIDENCE_ID],
			actorIds: ['ACTOR-01'],
			targetRefs: [{ kind: 'actor', targetId: 'ACTOR-01' }],
			action: {
				type: 'move_during_interval',
				fromMeters: [-3, 0, 0],
				toMeters: [1, 0, 0]
			},
			clock: {
				evidenceId: DEMO_EVIDENCE_ID,
				clockId: `camera:${DEMO_EVIDENCE_ID}`,
				startMs: 1000,
				endMs: 3000,
				uncertaintyMs: 100
			}
		},
		{
			eventId: 'EVENT-WALK-02',
			cameraPreset: 'isometric',
			cueType: 'move',
			label: 'Synthetic Actor B walk interval',
			status: 'hypothesis',
			reviewStatus: 'unreviewed',
			evidenceIds: [DEMO_EVIDENCE_ID],
			actorIds: ['ACTOR-02'],
			targetRefs: [{ kind: 'actor', targetId: 'ACTOR-02' }],
			action: {
				type: 'move_during_interval',
				fromMeters: [2, 0, -1],
				toMeters: [2, 0, 3]
			},
			clock: {
				evidenceId: DEMO_EVIDENCE_ID,
				clockId: `camera:${DEMO_EVIDENCE_ID}`,
				startMs: 2000,
				endMs: 4000,
				uncertaintyMs: 100
			}
		}
	],
	environment: {
		kind: 'beach',
		seed: 42,
		cellSizeMeters: 32,
		extentMeters: { x: 320, z: 320 },
		coordinateStatus: 'illustrative_uncalibrated',
		calibrationEvidenceIds: []
	},
	quality: {
		profile: 'retro',
		maxTextureDimension: 128,
		maxTriangles: 100_000,
		maxInstances: 20_000,
		activeSceneMemoryMiB: 8
	},
	provenance: {
		intakeStatus: 'USER_INTAKE_UNVERIFIED',
		clockPolicy: 'source_local_unaligned',
		identityPolicy: 'pseudonymous_visual_handles',
		motivePolicy: 'unknown_or_cited_hypothesis'
	}
});

const demoRecipe = compileSceneRuntimeRecipeV1(demoPlan);
const prefabDemoRecipe = attachModularPrefabAssemblyToRecipeV1(demoRecipe, 'courtroom.generic.v1');
const { planHash: _demoPlanHash, ...demoPlanBody } = demoPlan;
const conflictDemoPlan = buildSceneGenerationPlanV1({
	...demoPlanBody,
	events: [...demoPlanBody.events, {
		...demoPlanBody.events[0]!,
		eventId: 'EVENT-WALK-ALT-01',
		label: 'Synthetic alternative movement proposal for conflict testing',
		action: { type: 'move_during_interval' as const, fromMeters: [-3, 0, 0] as [number, number, number], toMeters: [-3, 0, 4] as [number, number, number] }
	}]
});
const conflictDemoRecipe = compileSceneRuntimeRecipeV1(conflictDemoPlan);
const maskObservationId = `sha256:${'b'.repeat(64)}`;
const maskArtifactSha256 = `sha256:${'c'.repeat(64)}`;
const maskChapter = {
	schema: 'atlas.storybook-image-chapter.v1' as const,
	chapterId: '55555555-5555-4555-8555-555555555555',
	prefillSha256: `sha256:${'d'.repeat(64)}`,
	title: 'Synthetic contour editor fixture',
	beats: [{ what: 'Synthetic polygon for editor interaction testing', how: 'Coordinates remain in original image pixels.', observationIds: [maskObservationId] }],
	reviewState: 'REVIEWED_HYPOTHESIS' as const,
	evidenceId: DEMO_EVIDENCE_ID,
	sourceRevision: `sha256:${DEMO_HASH}`,
	analysisRevision: 'synthetic-mask-fixture-v1',
	observationRevision: `sha256:${'e'.repeat(64)}`,
	coordinateSpace: 'ORIGINAL_IMAGE_PIXELS' as const,
	width: 640,
	height: 480,
	coverage: { detection: 'RECORDED' as const, mask: 'RECORDED' as const, sceneContext: 'NOT_RECORDED' as const, unresolvedMaskCount: 0 },
	citations: [{ kind: 'segmentation_mask' as const, observationId: maskObservationId, label: 'Synthetic editor test mask', modelRevision: null,
		artifactSha256: maskArtifactSha256, detectionObservationId: `sha256:${'f'.repeat(64)}`, imageCell: { column: 2, row: 2 } }],
	maskPolygons: [{ maskObservationId, artifactSha256: maskArtifactSha256, coordinateSpace: 'ORIGINAL_IMAGE_PIXELS' as const,
		reviewState: 'HUMAN_ACCEPTED_2D' as const, polygons: [{ outer: [[100, 90], [420, 90], [420, 360], [100, 360]], holes: [[[210, 180], [300, 180], [300, 260], [210, 260]]] }] }]
};
const maskDemoManifest = createSceneDocumentV1({
		schema: 'parent-atlas.scene-document.v1', sceneId: DEMO_SCENE_ID, caseId: DEMO_CASE_ID,
		status: 'FIXTURE', sceneClassification: 'SYNTHETIC_FIXTURE', revision: 1, parentManifestSha256: null,
		createdAt: '2026-11-20T00:00:00.000Z', coordinateFrame: 'GLTF_Y_UP_METERS', objects: [], animations: [],
		evidenceBindings: [{ evidenceId: DEMO_EVIDENCE_ID, sourceRevision: `sha256:${DEMO_HASH}` }], assets: [],
		quality: createSceneQualityReceiptV1({ derivedAssetBytes: 0, triangleCount: 0 }), imageStorybookChapter: maskChapter
	});
const maskDemoRevision = {
	manifest: maskDemoManifest,
	manifestSha256: createHash('sha256').update(stableStringifySceneDocumentV1(maskDemoManifest), 'utf8').digest('hex')
};

/** Serve only the immutable synthetic fixture; this route has no case or write API. */
export const load: PageServerLoad = async ({ url }) => {
	const conflictFixture = url.searchParams.get('conflict-fixture') === '1';
	const maskFixture = url.searchParams.get('mask-fixture') === '1';
	const prefabFixture = url.searchParams.get('prefab-fixture') === '1';
	const planBuilderFixture = url.searchParams.get('plan-builder') === '1';
	return ({
	fixture: CURFEW_BEACH_CASE_FIXTURE_V1,
	demoPlan: conflictFixture ? conflictDemoPlan : demoPlan,
	demoRecipe: conflictFixture ? conflictDemoRecipe : prefabFixture ? prefabDemoRecipe : demoRecipe,
	...(maskFixture ? { demoRevision: maskDemoRevision } : {}),
	demoEvidenceItems: [{ id: DEMO_EVIDENCE_ID, title: 'Synthetic Beach Camera A (Read-Only Demo)', mimeType: 'text/plain' }],
	showV2CanvasInitial: url.searchParams.get('v2') === '1' || conflictFixture || maskFixture || prefabFixture,
	conflictFixture,
	maskFixture,
	prefabFixture,
	planBuilderFixture
	});
};
