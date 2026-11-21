import { storybookImageChapterV1Schema, type StorybookImageChapterV1 } from '$lib/shared/storybook-image-chapter-v1.js';
import type { ReviewedPolygonMeshRecipeV1 } from '$lib/splat/reviewed-polygon-mesh-v1.js';
import type { PolygonPointV1 } from '$lib/splat/polygon-prism-validation-v1.js';
import type { MaskPolygonV1 } from '$lib/splat/mask-contour-compiler-v1.js';
import { moveReviewedPolygonVertexV1, validateReviewedPolygonMeshRecipeV1 } from '$lib/splat/reviewed-polygon-mesh-v1.js';

export interface ScenePolygonSourceBindingV1 {
	evidenceId: string;
	sourceRevision: string;
}

export interface SceneReviewedPolygonV1 {
	objectId: string;
	label: string;
	recipe: ReviewedPolygonMeshRecipeV1;
}

export interface SceneReviewedPolygonEditDraftV1 extends SceneReviewedPolygonV1 {
	originalRecipe: ReviewedPolygonMeshRecipeV1;
	history: readonly MaskPolygonV1[];
	historyIndex: number;
	revisionCounter: number;
}

/** Project only chapter contours whose exact evidence revision is in this scene plan. */
export function collectSceneReviewedPolygonsV1(
	chapters: readonly unknown[],
	sources: readonly ScenePolygonSourceBindingV1[]
): SceneReviewedPolygonV1[] {
	const sourceById = new Map(sources.map((source) => [source.evidenceId, source.sourceRevision]));
	const result: SceneReviewedPolygonV1[] = [];
	for (const raw of chapters) {
		const parsed = storybookImageChapterV1Schema.safeParse(raw);
		if (!parsed.success) continue;
		const chapter: StorybookImageChapterV1 = parsed.data;
		if (sourceById.get(chapter.evidenceId) !== chapter.sourceRevision || !chapter.maskPolygons?.length) continue;
		for (const mask of chapter.maskPolygons) {
			const citation = chapter.citations.find((item) => item.kind === 'segmentation_mask' &&
				item.observationId === mask.maskObservationId && item.artifactSha256 === mask.artifactSha256);
			if (!citation) continue;
			const sourceSha256 = chapter.sourceRevision.slice('sha256:'.length);
			mask.polygons.forEach((polygon, index) => {
				const ordinal = index + 1;
				result.push({
					objectId: `MASK-${chapter.chapterId}-${mask.maskObservationId.slice(-8)}-${ordinal}`,
					label: `${chapter.title} · mask ${ordinal}`,
					recipe: {
						schema: 'atlas.reviewed-polygon-mesh.v1',
						geometryRevision: `${chapter.chapterId}:${mask.maskObservationId}:${ordinal}`,
						evidenceId: chapter.evidenceId,
						sourceSha256,
						sourceRevision: chapter.sourceRevision,
						reviewRevision: chapter.prefillSha256,
						width: chapter.width,
						height: chapter.height,
						polygon: {
							outer: polygon.outer.map(([x, y]) => [x, y] as PolygonPointV1),
							holes: polygon.holes.map((ring) => ring.map(([x, y]) => [x, y] as PolygonPointV1))
						}
					}
				});
			});
		}
	}
	return result;
}

export function createSceneReviewedPolygonEditDraftsV1(polygons: readonly SceneReviewedPolygonV1[]): SceneReviewedPolygonEditDraftV1[] {
	return polygons.map((item) => ({ ...item, originalRecipe: item.recipe, history: [item.recipe.polygon], historyIndex: 0, revisionCounter: 0 }));
}

export function editSceneReviewedPolygonVertexV1(input: {
	draft: SceneReviewedPolygonEditDraftV1;
	ring: 'outer' | 'hole';
	holeIndex?: number;
	vertexIndex: number;
	positionPx: PolygonPointV1;
}): SceneReviewedPolygonEditDraftV1 {
	const revisionCounter = input.draft.revisionCounter + 1;
	const recipe = moveReviewedPolygonVertexV1({
		recipe: input.draft.recipe,
		nextGeometryRevision: `${input.draft.originalRecipe.geometryRevision}:draft-${revisionCounter}`,
		ring: input.ring,
		holeIndex: input.holeIndex,
		vertexIndex: input.vertexIndex,
		positionPx: input.positionPx
	});
	const history = [...input.draft.history.slice(0, input.draft.historyIndex + 1), recipe.polygon];
	return { ...input.draft, recipe, history, historyIndex: history.length - 1, revisionCounter };
}

export function stepSceneReviewedPolygonEditHistoryV1(
	draft: SceneReviewedPolygonEditDraftV1,
	direction: 'undo' | 'redo'
): SceneReviewedPolygonEditDraftV1 {
	const historyIndex = direction === 'undo' ? draft.historyIndex - 1 : draft.historyIndex + 1;
	if (historyIndex < 0 || historyIndex >= draft.history.length) return draft;
	const revisionCounter = draft.revisionCounter + 1;
	const recipe = { ...draft.recipe, geometryRevision: `${draft.originalRecipe.geometryRevision}:draft-${revisionCounter}`, polygon: draft.history[historyIndex]! };
	validateReviewedPolygonMeshRecipeV1(recipe);
	return { ...draft, recipe, historyIndex, revisionCounter };
}
