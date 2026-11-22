import { describe, expect, it } from 'vitest';
import { buildSceneGenerationPlanV1 } from '$lib/server/reconstruction/scene-generation-plan-v1.js';
import { createSceneQualityReceiptV1, sceneDocumentV1Schema } from '$lib/splat/scene-document-v1.js';
import { applyScenePolygonEditV1, collectSceneReviewedPolygonsV1, createSceneReviewedPolygonEditDraftsV1, editSceneReviewedPolygonVertexV1, reviewedContourSceneSourcesV1, scenePolygonEditV1Schema, serializeScenePolygonEditsV1, stepSceneReviewedPolygonEditHistoryV1 } from './scene-reviewed-polygons-v1.js';

const evidenceId = '44444444-4444-4444-8444-444444444444';
const sourceRevision = `sha256:${'a'.repeat(64)}`;
const observationId = `sha256:${'b'.repeat(64)}`;
const maskObservationId = `sha256:${'c'.repeat(64)}`;
const artifactSha256 = `sha256:${'d'.repeat(64)}`;
const chapter = {
	evidenceId,
	sourceRevision,
	analysisRevision: 'image-run-v1',
	observationRevision: `sha256:${'e'.repeat(64)}`,
	chapterId: '33333333-3333-4333-8333-333333333333',
	prefillSha256: `sha256:${'f'.repeat(64)}`,
	title: 'Reviewed image mask',
	beats: [{ what: 'A mask was reviewed.', how: 'Keep the outline in image pixels.', observationIds: [observationId] }],
	schema: 'atlas.storybook-image-chapter.v1',
	reviewState: 'REVIEWED_HYPOTHESIS',
	coordinateSpace: 'ORIGINAL_IMAGE_PIXELS',
	width: 100,
	height: 80,
	coverage: { detection: 'RECORDED', mask: 'RECORDED', sceneContext: 'NOT_RECORDED', unresolvedMaskCount: 0, ocr: 'EMPTY' },
	citations: [
		{ kind: 'detection', observationId, label: 'chair', modelRevision: 'detector-v1', imageCell: { column: 2, row: 2 } },
		{ kind: 'segmentation_mask', observationId: maskObservationId, label: 'chair', modelRevision: 'sam-v1', artifactSha256, detectionObservationId: observationId, imageCell: { column: 2, row: 2 } }
	],
	maskPolygons: [{ maskObservationId, artifactSha256, coordinateSpace: 'ORIGINAL_IMAGE_PIXELS', reviewState: 'HUMAN_ACCEPTED_2D', polygons: [{ outer: [[10, 10], [40, 10], [40, 40], [10, 40]], holes: [] }] }]
};

describe('scene reviewed polygon projection v1', () => {
	it('rehydrates the serialized derivative in source pixels while retaining the immutable reviewed base', () => {
		const bases = collectSceneReviewedPolygonsV1([chapter], [{ evidenceId, sourceRevision }]);
		const [draft] = createSceneReviewedPolygonEditDraftsV1(bases);
		const edited = editSceneReviewedPolygonVertexV1({ draft: draft!, ring: 'outer', vertexIndex: 2, positionPx: [35, 35] });
		const stored = scenePolygonEditV1Schema.parse(JSON.parse(JSON.stringify(serializeScenePolygonEditsV1([edited])[0])));
		const { polygon: _polygon, reviewState: _reviewState, ...binding } = stored;
		const note = { ...binding, id: '55555555-5555-4555-8555-555555555555', text: 'Compare this contour to the source image.' };
		expect(stored.reviewState).toBe('UNREVIEWED_SCENE_EDIT');
		const [reopened] = createSceneReviewedPolygonEditDraftsV1(bases, [stored]);
		expect(reopened?.recipe.polygon.outer[2]).toEqual([35, 35]);
		expect(reopened?.originalRecipe.polygon.outer[2]).toEqual([40, 40]);
		expect(serializeScenePolygonEditsV1([stepSceneReviewedPolygonEditHistoryV1(reopened!, 'undo')])).toEqual([]);
		expect(() => applyScenePolygonEditV1(bases[0]!, { ...stored, reviewRevision: `sha256:${'0'.repeat(64)}` })).toThrow('SCENE_POLYGON_EDIT_BASE_MISMATCH');
		expect(() => applyScenePolygonEditV1(bases[0]!, { ...stored, polygon: { ...stored.polygon, outer: [[-1, 10], [40, 10], [35, 35], [10, 40]] } })).toThrow(/OUTSIDE_SOURCE/);
		expect(scenePolygonEditV1Schema.safeParse({ ...stored, reviewState: 'HUMAN_ACCEPTED_2D' }).success).toBe(false);
		const caseId = '11111111-1111-4111-8111-111111111111';
		const sceneId = '22222222-2222-4222-8222-222222222222';
		const plan = buildSceneGenerationPlanV1({
			schema: 'parent-atlas.scene-generation-plan/v1', caseId, sceneId, expectedSceneRevision: 1,
			generator: 'procedural-three-scene-v1', caseIntake: null,
			narrative: { why: { status: 'unknown' }, how: { status: 'unknown' } },
			sources: [{ evidenceId, sourceRevision, sha256: sourceRevision.slice(7) }],
			actors: [], primitives: [], placements: [], events: [],
			environment: { kind: 'indoor', seed: 7, cellSizeMeters: 32, extentMeters: { x: 32, z: 32 }, coordinateStatus: 'illustrative_uncalibrated' },
			quality: { profile: 'retro', maxTextureDimension: 128, maxTriangles: 50_000, maxInstances: 10_000, activeSceneMemoryMiB: 8 },
			provenance: { intakeStatus: 'USER_INTAKE_UNVERIFIED', clockPolicy: 'source_local_unaligned', identityPolicy: 'pseudonymous_visual_handles', motivePolicy: 'unknown_or_cited_hypothesis' }
		});
		const document = {
			schema: 'parent-atlas.scene-document.v1', caseId, sceneId, status: 'HYPOTHESIS', revision: 2,
			parentManifestSha256: 'e'.repeat(64), createdAt: '2026-11-20T00:00:00.000Z', coordinateFrame: 'LOCAL_UNCALIBRATED',
			objects: [], animations: [], assets: [], evidenceBindings: [{ evidenceId, sourceRevision }],
			imageStorybookChapters: [chapter],
			quality: createSceneQualityReceiptV1({ derivedAssetBytes: 0, triangleCount: 0 }),
			proceduralPreviewDraft: { schema: 'parent-atlas.scene-preview-draft/v1', plan, annotations: [], polygonEdits: [stored], contourNotes: [note] }
		};
		expect(sceneDocumentV1Schema.parse(document).proceduralPreviewDraft?.polygonEdits).toEqual([stored]);
		expect(sceneDocumentV1Schema.parse(document).proceduralPreviewDraft?.contourNotes).toEqual([note]);
		for (const contourNotes of [[note, note], [{ ...note, reviewRevision: `sha256:${'0'.repeat(64)}` }]]) {
			expect(sceneDocumentV1Schema.safeParse({ ...document, proceduralPreviewDraft: {
				...document.proceduralPreviewDraft, polygonEdits: [], contourNotes
			} }).success).toBe(false);
		}
		expect(sceneDocumentV1Schema.safeParse({ ...document, imageStorybookChapters: [] }).success).toBe(false);
		const chapterOnly = sceneDocumentV1Schema.parse({ ...document, proceduralPreviewDraft: undefined });
		expect(reviewedContourSceneSourcesV1(chapterOnly)).toEqual([{ evidenceId, sourceRevision }]);
		expect(reviewedContourSceneSourcesV1({ ...chapterOnly, coordinateFrame: 'GLTF_Y_UP_METERS' })).toEqual([]);
		const existingChapter = chapterOnly.imageStorybookChapters![0]!;
		expect(reviewedContourSceneSourcesV1({ ...chapterOnly, imageStorybookChapters: [existingChapter, {
			...existingChapter, sourceRevision: `sha256:${'9'.repeat(64)}`
		}] })).toEqual([]);
	});

	it('projects accepted contours only when the scene pins the exact source revision', () => {
		const [item] = collectSceneReviewedPolygonsV1([chapter], [{ evidenceId, sourceRevision }]);
		expect(item).toMatchObject({ label: 'Reviewed image mask · mask 1', recipe: { evidenceId, sourceRevision, sourceSha256: 'a'.repeat(64), reviewRevision: chapter.prefillSha256, width: 100, height: 80 } });
		expect(collectSceneReviewedPolygonsV1([chapter], [{ evidenceId, sourceRevision: `sha256:${'9'.repeat(64)}` }])).toEqual([]);
	});

	it('rejects a contour whose mask artifact no longer matches its citation', () => {
		const stale = { ...chapter, maskPolygons: chapter.maskPolygons.map((item) => ({ ...item, artifactSha256: `sha256:${'9'.repeat(64)}` })) };
		expect(collectSceneReviewedPolygonsV1([stale], [{ evidenceId, sourceRevision }])).toEqual([]);
	});

	it('creates immutable, validated pixel edits with undo and redo revisions', () => {
		const source = createSceneReviewedPolygonEditDraftsV1(collectSceneReviewedPolygonsV1([chapter], [{ evidenceId, sourceRevision }]))[0]!;
		const edited = editSceneReviewedPolygonVertexV1({ draft: source, ring: 'outer', vertexIndex: 2, positionPx: [35, 35] });
		expect(source.recipe.polygon.outer[2]).toEqual([40, 40]);
		expect(edited.recipe.polygon.outer[2]).toEqual([35, 35]);
		const undone = stepSceneReviewedPolygonEditHistoryV1(edited, 'undo');
		expect(undone.recipe.polygon.outer[2]).toEqual([40, 40]);
		const redone = stepSceneReviewedPolygonEditHistoryV1(undone, 'redo');
		expect(redone.recipe.polygon.outer[2]).toEqual([35, 35]);
		expect(() => editSceneReviewedPolygonVertexV1({ draft: source, ring: 'outer', vertexIndex: 2, positionPx: [101, 40] })).toThrow(/OUTSIDE_SOURCE/);
	});
});
