import { z } from 'zod';
import type { StorybookImageObservationsV1 } from './storybook-image-observations-v1.js';

export const STORYBOOK_REGION_GRID_SIZE = 8;
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const storybookRegionFrameV1Schema = z.object({
	analysisRevision: z.string().min(1).max(256),
	frameIndex: z.number().int().min(0).max(59),
	artifactSha256: digest,
}).strict();

export const storybookRegionCellV1Schema = z.object({
	column: z.number().int().min(0).max(STORYBOOK_REGION_GRID_SIZE - 1),
	row: z.number().int().min(0).max(STORYBOOK_REGION_GRID_SIZE - 1),
}).strict();

export const storybookRegionImageV1Schema = z.object({
	analysisRevision: z.string().min(1).max(256),
	observationRevision: digest,
}).strict();

const reviewFields = {
	schema: z.literal('atlas.storybook-region-review.v1'),
	reviewId: z.uuid(),
	width: z.number().int().min(1).max(32_768),
	height: z.number().int().min(1).max(32_768),
	...storybookRegionCellV1Schema.shape,
	decision: z.enum(['UNCLASSIFIED', 'NOT_REVIEWED', 'NO_OBJECT_OBSERVED']),
	notes: z.string().trim().max(600),
};

export const storybookRegionReviewV1Schema = z.union([
	storybookRegionFrameV1Schema.extend({ ...reviewFields, timestampMs: z.number().int().nonnegative() }).strict(),
	storybookRegionImageV1Schema.extend(reviewFields).strict(),
	storybookRegionImageV1Schema.extend({
		schema: reviewFields.schema, reviewId: reviewFields.reviewId, width: reviewFields.width, height: reviewFields.height,
		observationId: digest, notes: reviewFields.notes,
		decision: z.enum(['ACCEPTED', 'REJECTED', 'UNCERTAIN']),
	}).strict(),
]);

export type StorybookRegionReviewV1 = z.infer<typeof storybookRegionReviewV1Schema>;

export const storybookRegionDecisionLabels = {
	UNCLASSIFIED: 'Unclassified',
	NOT_REVIEWED: 'Not reviewed',
	NO_OBJECT_OBSERVED: 'No object observed',
	ACCEPTED: 'Accepted',
	REJECTED: 'Rejected',
	UNCERTAIN: 'Uncertain',
} satisfies Record<StorybookRegionReviewV1['decision'], string>;

export function reviewableImageObservationsV1(manifest: StorybookImageObservationsV1) {
	return [
		...(manifest.detectionCoverage === 'RECORDED' ? manifest.detections : []),
		...(manifest.maskCoverage === 'RECORDED' && manifest.detectionCoverage === 'RECORDED' ? manifest.masks : []),
		...(manifest.sceneContextCoverage === 'RECORDED' && manifest.sceneContext ? [manifest.sceneContext] : []),
		...(manifest.ocrCoverage === 'COMPLETED' && manifest.ocrSpan ? [manifest.ocrSpan] : []),
	];
}
