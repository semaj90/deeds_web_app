import { z } from 'zod';
import { storybookImageObservationScopeV1Schema, storybookImageObservationsV1Schema, storybookImageOcrSpanV1Schema, type StorybookImageObservationsV1 } from './storybook-image-observations-v1.js';
import { storybookRegionCellV1Schema } from './storybook-region-review-v1.js';
import { storybookImageCellForBoxV1 } from './storybook-video-chapter-v1.js';

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const label = z.string().min(1).max(100);
const modelRevision = z.string().min(1).max(256).nullable();
const imageSceneCellSchema = z.object({
	observationId: digest,
	reviewVersionId: z.uuid(),
	sourceCell: storybookRegionCellV1Schema,
	placedCell: storybookRegionCellV1Schema,
}).strict();
export type StorybookImageSceneCellV1 = z.infer<typeof imageSceneCellSchema>;
export const storybookRelativeDepthV1Schema = z.object({
	kind: z.literal('relative_monocular'),
	artifactSha256: digest, weightsSha256: digest,
	modelId: z.string().min(1).max(256), modelRevision: z.string().min(1).max(256),
	width: z.number().int().min(1).max(8192), height: z.number().int().min(1).max(8192),
}).strict();
export type StorybookRelativeDepthV1 = z.infer<typeof storybookRelativeDepthV1Schema>;
const reviewSchema = z.object({
	chapterId: z.uuid(), prefillSha256: digest, title: z.string().trim().min(1).max(120),
	beats: z.array(z.object({ what: z.string().trim().min(1).max(480), how: z.string().trim().min(1).max(480),
		observationIds: z.array(digest).min(1).max(4).refine((ids) => new Set(ids).size === ids.length),
	}).strict()).min(1).max(2),
}).strict();

const citationSchema = z.union([
	z.object({ kind: z.literal('detection'), observationId: digest, label, modelRevision, imageCell: storybookRegionCellV1Schema }).strict(),
	z.object({ kind: z.literal('segmentation_mask'), observationId: digest, label, modelRevision,
		artifactSha256: digest, detectionObservationId: digest, imageCell: storybookRegionCellV1Schema }).strict(),
	z.object({ kind: z.literal('scene_context'), observationId: digest, description: z.string().min(1).max(5000),
		modelId: z.string().min(1).max(256).nullable(), reviewState: z.literal('UNREVIEWED_PROPOSAL') }).strict(),
	storybookImageOcrSpanV1Schema,
]);

export const storybookImageChapterV1Schema = storybookImageObservationScopeV1Schema.extend({
	...reviewSchema.shape,
	schema: z.literal('atlas.storybook-image-chapter.v1'), reviewState: z.literal('REVIEWED_HYPOTHESIS'),
	coordinateSpace: z.literal('ORIGINAL_IMAGE_PIXELS'),
	width: z.number().int().positive(), height: z.number().int().positive(),
	coverage: z.object({
		detection: storybookImageObservationsV1Schema.shape.detectionCoverage,
		mask: storybookImageObservationsV1Schema.shape.maskCoverage,
		sceneContext: storybookImageObservationsV1Schema.shape.sceneContextCoverage.unwrap(),
		unresolvedMaskCount: storybookImageObservationsV1Schema.shape.unresolvedMaskCount,
		ocr: storybookImageObservationsV1Schema.shape.ocrCoverage,
	}).strict(),
	citations: z.array(citationSchema).min(1).max(8),
	sceneCells: z.array(imageSceneCellSchema).min(1).max(8).optional(),
	relativeDepth: storybookRelativeDepthV1Schema.optional(),
}).strict().refine(({ beats, citations, sceneCells, relativeDepth, width, height }) => {
	const ids = [...new Set(beats.flatMap((beat) => beat.observationIds))];
	return (!relativeDepth || Boolean(sceneCells?.length) && relativeDepth.width === width && relativeDepth.height === height) &&
		ids.length === citations.length && ids.every((id, index) => id === citations[index]?.observationId) &&
		(!sceneCells || new Set(sceneCells.map((cell) => cell.observationId)).size === sceneCells.length &&
			sceneCells.every((cell) => citations.some((citation) => 'imageCell' in citation &&
				citation.observationId === cell.observationId && citation.imageCell.column === cell.sourceCell.column &&
				citation.imageCell.row === cell.sourceCell.row)));
}, { message: 'Chapter citations and cells must match the reviewed beats' });

export type StorybookImageChapterV1 = z.infer<typeof storybookImageChapterV1Schema>;

/** Derive the citation snapshot from registered observations, including the detector cell behind each mask. */
export function buildReviewedImageStorybookChapterV1(
	observations: StorybookImageObservationsV1, review: z.infer<typeof reviewSchema>,
	placements: readonly Pick<StorybookImageSceneCellV1, 'observationId' | 'placedCell'>[] = [],
	relativeDepth?: StorybookRelativeDepthV1,
) {
	const { evidenceId, sourceRevision, analysisRevision, observationRevision, width, height, coordinateSpace } = observations;
	const input = reviewSchema.safeParse({ chapterId: review.chapterId, prefillSha256: review.prefillSha256, title: review.title, beats: review.beats });
	if (!input.success) return null;
	const citations: StorybookImageChapterV1['citations'] = [];
	for (const id of new Set(input.data.beats.flatMap((beat) => beat.observationIds))) {
		if (observations.ocrCoverage === 'COMPLETED' && observations.ocrSpan?.observationId === id) {
			citations.push(observations.ocrSpan);
			continue;
		}
		if (observations.sceneContext?.observationId === id && observations.sceneContextCoverage === 'RECORDED') {
			citations.push(observations.sceneContext);
			continue;
		}
		const mask = observations.maskCoverage === 'RECORDED' ? observations.masks.find((entry) => entry.observationId === id) : undefined;
		const detection = observations.detections.find((entry) => entry.observationId === (mask?.detectionObservationId ?? id));
		if (!detection || observations.detectionCoverage !== 'RECORDED') return null;
		const [left, top, right, bottom] = detection.bbox;
		const imageCell = storybookImageCellForBoxV1([left, top, right, bottom], width, height);
		citations.push(mask ? { ...mask, imageCell } : { kind: 'detection', observationId: id, label: detection.label,
			modelRevision: detection.modelRevision, imageCell });
	}
	const sceneCells: StorybookImageSceneCellV1[] = [];
	for (const placement of placements) {
		const citation = citations.find((entry) => entry.observationId === placement.observationId);
		const decision = observations.reviews?.find((entry) => entry.observationId === placement.observationId);
		if (!citation || !('imageCell' in citation) || decision?.decision !== 'ACCEPTED') return null;
		sceneCells.push({ observationId: citation.observationId, reviewVersionId: decision.versionId,
			sourceCell: citation.imageCell, placedCell: placement.placedCell });
	}
	const parsed = storybookImageChapterV1Schema.safeParse({ ...input.data, schema: 'atlas.storybook-image-chapter.v1',
		reviewState: 'REVIEWED_HYPOTHESIS', evidenceId, sourceRevision, analysisRevision, observationRevision, width, height, coordinateSpace, citations,
		...(sceneCells.length ? { sceneCells } : {}),
		...(relativeDepth ? { relativeDepth } : {}),
		coverage: { detection: observations.detectionCoverage, mask: observations.maskCoverage,
			sceneContext: observations.sceneContextCoverage ?? 'NOT_RECORDED', unresolvedMaskCount: observations.unresolvedMaskCount,
			...(observations.ocrCoverage ? { ocr: observations.ocrCoverage } : {}) } });
	return parsed.success ? parsed.data : null;
}

export function storybookRelativeDepthHrefV1(chapter: StorybookImageChapterV1) {
	if (!chapter.relativeDepth) return null;
	const query = new URLSearchParams({ sourceRevision: chapter.sourceRevision,
		analysisRevision: chapter.analysisRevision, artifactSha256: chapter.relativeDepth.artifactSha256 });
	return `/api/evidence/${encodeURIComponent(chapter.evidenceId)}/depth-map?${query}`;
}

export function savedImageChapterHrefV1(input: { caseId: string; sceneId: string; revision: number; chapterId: string }) {
	const query = new URLSearchParams({ storyScene: input.sceneId, storyRevision: String(input.revision), storyImage: input.chapterId });
	return `/cases/${encodeURIComponent(input.caseId)}/crime-scene?${query}#saved-storybook-chapter`;
}
