import { storybookImageCellForBoxV1, storybookVideoChapterV1Schema, type StorybookVideoCitationV1 } from '$lib/shared/storybook-video-chapter-v1.js';
import { buildVideoStorybookCoverageV1 } from '$lib/server/features/evidence/video/video-storybook-coverage-v1.js';
import { videoDetectionReferenceIdV1, videoEventTimelineV1Schema } from '$lib/server/features/evidence/video/video-event-fusion-v1.js';

export function buildReviewedVideoStorybookChapterV1(input: {
	caseId: string; evidenceId: string; sourceRevision: string; videoAnalysis: unknown; eventId: string;
}) {
	const { videoAnalysis } = input;
	if (!videoAnalysis || typeof videoAnalysis !== 'object' || !('eventTimeline' in videoAnalysis)) return null;
	const timeline = videoEventTimelineV1Schema.safeParse(videoAnalysis.eventTimeline);
	const coverage = buildVideoStorybookCoverageV1(input);
	if (!timeline.success || !coverage || timeline.data.caseId !== input.caseId || timeline.data.evidenceId !== input.evidenceId ||
		timeline.data.sourceRevision !== input.sourceRevision || timeline.data.analysisRevision !== coverage.analysisRevision) return null;
	const event = timeline.data.events.find((candidate) => candidate.eventId === input.eventId);
	if (!event || event.reviewStatus !== 'APPROVED' || event.sceneAdmission !== 'APPROVED_FOR_SCENE_PROPOSAL' || !event.reviewedAt || !event.reviewedBy) return null;
	const frames = new Map(coverage.frames.map((frame) => [frame.frameIndex, frame]));
	const citations: StorybookVideoCitationV1[] = [];
	const unresolvedReferenceIds: string[] = [];
	for (const reference of event.sourceReferences) {
		const { referenceId, modelRevision } = reference;
		if (reference.kind === 'transcript_segment') {
			const { startMs, endMs, transcriptId, segmentIndex } = reference;
			if (startMs >= event.startMs && endMs <= event.endMs && startMs < endMs) {
				citations.push({ kind: reference.kind, referenceId, modelRevision, startMs, endMs, transcriptId, segmentIndex });
			} else unresolvedReferenceIds.push(referenceId);
			continue;
		}
		const frame = frames.get(reference.frameIndex);
		const sha = reference.artifactSha256;
		if (!frame || frame.timestampMs !== reference.timestampMs || frame.timestampMs < event.startMs || frame.timestampMs >= event.endMs ||
			frame.artifactSha256 !== (sha.startsWith('sha256:') ? sha : `sha256:${sha}`)) {
			unresolvedReferenceIds.push(referenceId);
			continue;
		}
		const frameCitation = { referenceId, modelRevision, frameIndex: frame.frameIndex, timestampMs: frame.timestampMs, artifactSha256: frame.artifactSha256 };
		if (reference.kind === 'frame_ocr') {
			if (frame.ocr?.status === 'COMPLETED' && frame.ocr.text === reference.text && frame.ocr.engine === modelRevision) {
				citations.push({ kind: reference.kind, ...frameCitation });
			} else unresolvedReferenceIds.push(referenceId);
			continue;
		}
		const observation = frame.detections.find((item) => videoDetectionReferenceIdV1(coverage, frame.frameIndex, item.ordinal) === referenceId);
		if (!observation || observation.label !== reference.label || observation.modelRevision !== modelRevision ||
			observation.confidence !== reference.confidence || observation.bbox.some((coordinate, i) => coordinate !== reference.bbox[i])) {
			unresolvedReferenceIds.push(referenceId);
			continue;
		}
		citations.push({ kind: reference.kind, ...frameCitation, label: observation.label, observationId: observation.observationId,
			imageCell: storybookImageCellForBoxV1(observation.bbox, frame.width, frame.height) });
	}
	const parsed = storybookVideoChapterV1Schema.safeParse({
		schema: 'atlas.storybook-video-chapter.v1', title: event.label, reviewedBy: event.reviewedBy, reviewedAt: event.reviewedAt,
		coordinateSpace: 'IMAGE_ONLY', coverage: 'SAMPLED_FRAMES_AND_EXCERPTS', citations, unresolvedReferenceIds,
	});
	return parsed.success ? { chapter: parsed.data, event, analysisRevision: coverage.analysisRevision } : null;
}
