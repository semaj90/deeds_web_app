import { describe, expect, it } from 'vitest';
import { collectSceneReviewedPolygonsV1, createSceneReviewedPolygonEditDraftsV1, editSceneReviewedPolygonVertexV1, stepSceneReviewedPolygonEditHistoryV1 } from './scene-reviewed-polygons-v1.js';

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
