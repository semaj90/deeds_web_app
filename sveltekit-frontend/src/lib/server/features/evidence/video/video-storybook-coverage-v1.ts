import { z } from 'zod';
import { computeObservationId } from '$lib/server/reconstruction/scene-observation-manifest-v1.js';
import { videoEventTimelineV1Schema } from './video-event-fusion-v1.js';
import type { StorybookRegionReviewV1 } from '$lib/shared/storybook-region-review-v1.js';

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const revision = z.string().min(1).max(256);
const dimension = z.number().int().min(1).max(32_768);
const timestamp = z.number().int().nonnegative();
const stageStatus = z.enum(['COMPLETED', 'FAILED', 'UNAVAILABLE']);
const scopeSchema = z.object({
	schema: z.literal('atlas.video-analysis.v1'),
	sourceRevision: digest,
	analysisRevision: revision,
	analysisJobId: z.uuid(),
	detectorStatus: stageStatus.optional(),
	transcriptionStatus: z.enum(['COMPLETED', 'SKIPPED_NO_AUDIO', 'TRANSCRIPTION_BINARY_UNAVAILABLE', 'FAILED']).optional(),
	frames: z.array(z.unknown()).max(60),
	eventTimeline: z.unknown().optional(),
});
const frameSourceSchema = z.object({
	frameIndex: z.number().int().min(0).max(59),
	timestampMs: timestamp,
	width: dimension,
	height: dimension,
	sourceRevision: digest,
	analysisRevision: revision,
	artifact: z.object({
		sha256: digest,
		sourceRevision: digest,
		analysisRevision: revision.optional(),
		contentType: z.literal('image/jpeg'),
	}),
});
const frameSchema = frameSourceSchema.extend({
	modelRevision: z.string().min(1).max(512).nullable(),
	detectionStatus: stageStatus.optional(),
	objects: z.array(z.unknown()).max(256),
	ocr: z.object({ engine: z.literal('tesseract'), status: z.enum(['COMPLETED', 'EMPTY', 'FAILED']), text: z.string().max(4000) }).optional(),
});
const coordinate = z.number().finite();
const detectionSchema = z.object({
	label: z.string().min(1).max(256),
	confidence: z.number().min(0).max(1),
	bbox: z.tuple([coordinate, coordinate, coordinate, coordinate]),
});

function matchesRun(frame: z.infer<typeof frameSourceSchema>, frameIndex: number, source: z.infer<typeof scopeSchema>) {
	return frame.frameIndex === frameIndex && frame.sourceRevision === source.sourceRevision &&
		frame.analysisRevision === source.analysisRevision && frame.artifact.sourceRevision === source.sourceRevision &&
		(frame.artifact.analysisRevision === undefined || frame.artifact.analysisRevision === source.analysisRevision);
}

function projectFrame(value: unknown, frameIndex: number, source: z.infer<typeof scopeSchema>) {
	const parsed = frameSchema.safeParse(value);
	if (!parsed.success || !matchesRun(parsed.data, frameIndex, source)) return null;
	const frame = parsed.data;
	const artifact = frame.artifact;
	const target = { frameIndex, timestampMs: frame.timestampMs, artifactSha256: artifact.sha256 };
	const detections = frame.objects.flatMap((candidate, ordinal) => {
		const object = detectionSchema.safeParse(candidate);
		if (!object.success || !frame.modelRevision) return [];
		const { label, confidence } = object.data;
		const [left, top, right, bottom] = object.data.bbox;
		if (left === undefined || top === undefined || right === undefined || bottom === undefined) return [];
		if (left < 0 || top < 0 || right > frame.width || bottom > frame.height || left >= right || top >= bottom) return [];
		const bbox: [number, number, number, number] = [left, top, right, bottom];
		const observationId = computeObservationId({ sourceRevision: source.sourceRevision, analysisRevision: source.analysisRevision,
			frameIndex, ordinal, artifactSha256: artifact.sha256, modelRevision: frame.modelRevision, label, bbox });
		return [{ observationId, ordinal, label, confidence, modelRevision: frame.modelRevision, bbox }];
	});
	return {
		...target,
		width: frame.width,
		height: frame.height,
		detectionStatus: frame.detectionStatus ?? (source.detectorStatus === 'COMPLETED' && frame.modelRevision ? 'COMPLETED' : 'NOT_RECORDED'),
		omittedDetectionCount: frame.objects.length - detections.length,
		detections,
		ocr: frame.ocr ?? null,
	};
}

/** Bounded read model over the existing persisted video run. Object keys stay server side. */
export function buildVideoStorybookCoverageV1(input: { evidenceId: string; caseId: string; sourceRevision: string | null; videoAnalysis: unknown }) {
	const source = scopeSchema.safeParse(input.videoAnalysis);
	if (!source.success || source.data.sourceRevision !== input.sourceRevision) return null;
	const run = source.data;
	const frames = run.frames.flatMap((candidate, index) => {
		const frame = projectFrame(candidate, index, run);
		return frame ? [frame] : [];
	}).sort((a, b) => a.timestampMs - b.timestampMs || a.frameIndex - b.frameIndex);
	const timeline = videoEventTimelineV1Schema.safeParse(run.eventTimeline);
	const events = timeline.success && timeline.data.evidenceId === input.evidenceId && timeline.data.caseId === input.caseId &&
		timeline.data.sourceRevision === run.sourceRevision && timeline.data.analysisRevision === run.analysisRevision
		? timeline.data.events : [];
	return {
		schema: 'atlas.video-storybook-coverage.v1' as const,
		evidenceId: input.evidenceId,
		sourceRevision: run.sourceRevision,
		analysisRevision: run.analysisRevision,
		analysisJobId: run.analysisJobId,
		coverage: 'SAMPLED_FRAMES' as const,
		omittedFrameCount: run.frames.length - frames.length,
		transcriptionStatus: run.transcriptionStatus ?? 'NOT_RECORDED',
		frames,
		reviewedEventCount: events.filter((event) => event.reviewStatus === 'APPROVED').length,
	};
}

export type VideoStorybookCoverageV1 = NonNullable<ReturnType<typeof buildVideoStorybookCoverageV1>>;

export function matchesCurrentStorybookReviewFrameV1(input: {
	sourceRevision: string;
	videoAnalysis: unknown;
	review: StorybookRegionReviewV1;
}): boolean {
	const { sourceRevision, videoAnalysis, review } = input;
	if (!('frameIndex' in review)) return false;
	const source = scopeSchema.safeParse(videoAnalysis);
	if (!source.success || source.data.sourceRevision !== sourceRevision || source.data.analysisRevision !== review.analysisRevision) return false;
	const parsed = frameSourceSchema.safeParse(source.data.frames[review.frameIndex]);
	if (!parsed.success || !matchesRun(parsed.data, review.frameIndex, source.data)) return false;
	const frame = parsed.data;
	return frame.artifact.sha256 === review.artifactSha256 && frame.timestampMs === review.timestampMs &&
		frame.width === review.width && frame.height === review.height;
}
