import { z } from 'zod';
import { STORYBOOK_REGION_GRID_SIZE, storybookRegionCellV1Schema } from './storybook-region-review-v1.js';

const reference = { referenceId: z.uuid(), modelRevision: z.string().min(1).max(512).nullable() };
const frame = {
	...reference,
	frameIndex: z.number().int().min(0).max(59),
	timestampMs: z.number().int().nonnegative(),
	artifactSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
};
const citation = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('transcript_segment'), ...reference, transcriptId: z.uuid(),
		segmentIndex: z.number().int().nonnegative(), startMs: z.number().int().nonnegative(), endMs: z.number().int().positive() }).strict(),
	z.object({ kind: z.literal('frame_ocr'), ...frame }).strict(),
	z.object({ kind: z.literal('frame_detection'), ...frame, label: z.string().min(1).max(256),
		observationId: z.string().regex(/^sha256:[a-f0-9]{64}$/), imageCell: storybookRegionCellV1Schema }).strict(),
]);

export const storybookVideoChapterV1Schema = z.object({
	schema: z.literal('atlas.storybook-video-chapter.v1'),
	title: z.string().min(1).max(160),
	reviewedBy: z.number().int().positive(),
	reviewedAt: z.iso.datetime({ offset: true }),
	coordinateSpace: z.literal('IMAGE_ONLY'),
	coverage: z.literal('SAMPLED_FRAMES_AND_EXCERPTS'),
	citations: z.array(citation).min(1).max(256),
	unresolvedReferenceIds: z.array(z.uuid()).max(256),
}).strict().refine((chapter) => {
	const ids = [...chapter.citations.map(({ referenceId }) => referenceId), ...chapter.unresolvedReferenceIds];
	return ids.length <= 256 && new Set(ids).size === ids.length;
}, { message: 'Chapter references must be unique and bounded' });

export type StorybookVideoChapterV1 = z.infer<typeof storybookVideoChapterV1Schema>;
export type StorybookVideoCitationV1 = StorybookVideoChapterV1['citations'][number];

export function storybookImageCellForBoxV1(bbox: readonly [number, number, number, number], width: number, height: number) {
	const size = STORYBOOK_REGION_GRID_SIZE;
	return {
		column: Math.min(size - 1, Math.floor(((bbox[0] + bbox[2]) / 2 / width) * size)),
		row: Math.min(size - 1, Math.floor(((bbox[1] + bbox[3]) / 2 / height) * size)),
	};
}

export function storybookSavedChapterHrefV1(input: { caseId: string; sceneId: string; revision: number; eventId: string }) {
	const query = new URLSearchParams({ storyScene: input.sceneId, storyRevision: String(input.revision), storyEvent: input.eventId });
	return `/cases/${encodeURIComponent(input.caseId)}/crime-scene?${query}#saved-storybook-chapter`;
}
