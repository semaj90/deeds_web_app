import { z } from 'zod';
import { storybookImageChapterV1Schema, type StorybookImageChapterV1 } from '$lib/shared/storybook-image-chapter-v1.js';
import type { ReviewedPolygonMeshRecipeV1 } from '$lib/splat/reviewed-polygon-mesh-v1.js';
import type { PolygonPointV1 } from '$lib/splat/polygon-prism-validation-v1.js';
import type { MaskPolygonV1 } from '$lib/splat/mask-contour-compiler-v1.js';
import { moveReviewedPolygonVertexV1, validateReviewedPolygonMeshRecipeV1 } from '$lib/splat/reviewed-polygon-mesh-v1.js';
import type { SceneDocumentV1 } from '$lib/splat/scene-document-v1.js';

export interface ScenePolygonSourceBindingV1 {
	evidenceId: string;
	sourceRevision: string;
}

/** Seed the case builder from prior reviewed image contours without adding geometry or identities. */
export function reviewedContourSceneSourcesV1(document: SceneDocumentV1): ScenePolygonSourceBindingV1[] {
	if (document.status !== 'HYPOTHESIS' || document.coordinateFrame !== 'LOCAL_UNCALIBRATED' || !document.caseId) return [];
	const sources = new Map<string, ScenePolygonSourceBindingV1>();
	const chapters = [...(document.imageStorybookChapter ? [document.imageStorybookChapter] : []), ...(document.imageStorybookChapters ?? [])];
	for (const chapter of chapters) {
		if (!chapter.maskPolygons?.length) continue;
		const { evidenceId, sourceRevision } = chapter;
		const previous = sources.get(evidenceId);
		if (previous && previous.sourceRevision !== sourceRevision) return [];
		sources.set(evidenceId, { evidenceId, sourceRevision });
	}
	return [...sources.values()];
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

const pixelPoint = z.tuple([z.number().finite(), z.number().finite()] as const)
	.transform(([x, y]): PolygonPointV1 => [x!, y!]);
const pixelRing = z.array(pixelPoint).min(3).max(256);
const contourBinding = z.object({
	objectId: z.string().min(1).max(128),
	baseGeometryRevision: z.string().min(1).max(256),
	evidenceId: z.uuid(),
	sourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
	reviewRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/)
}).strict();
export const sceneContourNoteV1Schema = contourBinding.extend({
	id: z.uuid(),
	text: z.string().trim().min(1).max(1000)
});
export type SceneContourNoteV1 = z.infer<typeof sceneContourNoteV1Schema>;
export const scenePolygonEditV1Schema = contourBinding.extend({
	polygon: z.object({ outer: pixelRing, holes: z.array(pixelRing).max(32) }).strict(),
	reviewState: z.literal('UNREVIEWED_SCENE_EDIT')
}).strict();
export type ScenePolygonEditV1 = z.infer<typeof scenePolygonEditV1Schema>;

export function matchesSceneContourBindingV1(base: SceneReviewedPolygonV1, binding: z.infer<typeof contourBinding>): boolean {
	const recipe = base.recipe;
	return binding.objectId === base.objectId && binding.baseGeometryRevision === recipe.geometryRevision &&
		binding.evidenceId === recipe.evidenceId && binding.sourceRevision === recipe.sourceRevision && binding.reviewRevision === recipe.reviewRevision;
}

export function applyScenePolygonEditV1(base: SceneReviewedPolygonV1, edit: ScenePolygonEditV1): ReviewedPolygonMeshRecipeV1 {
	const recipe = base.recipe;
	if (!matchesSceneContourBindingV1(base, edit) ||
		edit.polygon.outer.length !== recipe.polygon.outer.length || edit.polygon.holes.length !== recipe.polygon.holes.length ||
		edit.polygon.holes.some((ring, index) => ring.length !== recipe.polygon.holes[index]?.length)) {
		throw new Error('SCENE_POLYGON_EDIT_BASE_MISMATCH');
	}
	const result = { ...recipe, geometryRevision: `${base.recipe.geometryRevision}:scene-edit`, polygon: edit.polygon };
	validateReviewedPolygonMeshRecipeV1(result);
	return result;
}

export function serializeScenePolygonEditsV1(drafts: readonly SceneReviewedPolygonEditDraftV1[]): ScenePolygonEditV1[] {
	return drafts.flatMap(({ objectId, recipe, originalRecipe }) =>
		JSON.stringify(recipe.polygon) === JSON.stringify(originalRecipe.polygon) ? [] : [{
			objectId, baseGeometryRevision: originalRecipe.geometryRevision, evidenceId: recipe.evidenceId,
			sourceRevision: recipe.sourceRevision, reviewRevision: recipe.reviewRevision, polygon: recipe.polygon,
			reviewState: 'UNREVIEWED_SCENE_EDIT'
		}]);
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

export function createSceneReviewedPolygonEditDraftsV1(
	polygons: readonly SceneReviewedPolygonV1[], edits: readonly ScenePolygonEditV1[] = []
): SceneReviewedPolygonEditDraftV1[] {
	const editById = new Map(edits.map((edit) => [edit.objectId, edit]));
	return polygons.map((item) => {
		const edit = editById.get(item.objectId);
		const recipe = edit ? applyScenePolygonEditV1(item, edit) : item.recipe;
		const history = edit ? [item.recipe.polygon, recipe.polygon] : [item.recipe.polygon];
		return { ...item, recipe, originalRecipe: item.recipe, history, historyIndex: history.length - 1, revisionCounter: 0 };
	});
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
