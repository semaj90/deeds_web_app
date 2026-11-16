import { v5 as uuidv5 } from 'uuid';
import { z } from 'zod';
import { ATLAS_ROOT_NAMESPACE_V1 } from '$lib/server/atlas/identity/atlas-uuid-namespaces-v1.js';

export const VIDEO_EVENT_FUSION_REVISION_V1 = 'video-event-fusion-v1' as const;
export const VIDEO_EVENT_FUSION_BUCKET_MS_V1 = 10_000;

const namespace = uuidv5('atlas.video-event-fusion.v1', ATLAS_ROOT_NAMESPACE_V1);
const sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const artifactSha256Schema = z.string().regex(/^(?:sha256:)?[a-f0-9]{64}$/);

const transcriptInputSchema = z.object({
	segmentIndex: z.number().int().nonnegative(),
	startMs: z.number().int().nonnegative(),
	endMs: z.number().int().positive(),
	text: z.string().max(20_000),
	model: z.string().max(512).nullable().optional(),
}).strict().refine((value) => value.endMs > value.startMs, 'Transcript interval must be positive');

const frameInputSchema = z.object({
	frameIndex: z.number().int().nonnegative(),
	timestampMs: z.number().int().nonnegative(),
	width: z.number().int().positive(),
	height: z.number().int().positive(),
	modelRevision: z.string().max(512).nullable(),
	artifact: z.object({ sha256: artifactSha256Schema }).passthrough(),
	objects: z.array(z.object({
		label: z.string().trim().min(1).max(256),
		confidence: z.number().finite().min(0).max(1),
		bbox: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]),
		trackId: z.string().min(1).max(64).optional(),
		centerPx: z.tuple([z.number().finite(), z.number().finite()]).optional(),
		velocityPxPerSecond: z.tuple([z.number().finite(), z.number().finite()]).nullable().optional(),
		trackState: z.literal('UNREVIEWED_TRACK_HYPOTHESIS').optional(),
	}).strict()).max(256),
	ocr: z.object({ status: z.enum(['COMPLETED', 'EMPTY', 'FAILED']), text: z.string().max(4000) }).passthrough().optional(),
	sourceRevision: sha256Schema,
	analysisRevision: z.string().min(1).max(256),
}).passthrough();

const eventSourceSchema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('transcript_segment'),
		referenceId: z.string().uuid(),
		transcriptId: z.string().uuid(),
		segmentIndex: z.number().int().nonnegative(),
		startMs: z.number().int().nonnegative(),
		endMs: z.number().int().positive(),
		text: z.string().min(1).max(20_000),
		modelRevision: z.string().max(512).nullable(),
	}).strict(),
	z.object({
		kind: z.literal('frame_detection'),
		referenceId: z.string().uuid(),
		frameIndex: z.number().int().nonnegative(),
		timestampMs: z.number().int().nonnegative(),
		artifactSha256: artifactSha256Schema,
		modelRevision: z.string().max(512).nullable(),
		label: z.string().min(1).max(256),
		confidence: z.number().finite().min(0).max(1),
		bbox: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]),
	}).strict(),
	z.object({
		kind: z.literal('frame_ocr'),
		referenceId: z.string().uuid(),
		frameIndex: z.number().int().nonnegative(),
		timestampMs: z.number().int().nonnegative(),
		artifactSha256: artifactSha256Schema,
		text: z.string().min(1).max(4000),
		modelRevision: z.string().max(512).nullable(),
	}).strict(),
]);

const videoEventSchema = z.object({
	eventId: z.string().uuid(),
	startMs: z.number().int().nonnegative(),
	endMs: z.number().int().positive(),
	label: z.string().min(1).max(160),
	summary: z.string().min(1).max(4000),
	sourceReferences: z.array(eventSourceSchema).min(1).max(256),
	reviewStatus: z.enum(['UNREVIEWED_PROPOSAL', 'APPROVED', 'REJECTED']),
	sceneAdmission: z.enum(['NOT_ADMITTED', 'APPROVED_FOR_SCENE_PROPOSAL']),
	reviewedBy: z.number().int().positive().optional(),
	reviewedAt: z.string().datetime({ offset: true }).optional(),
}).strict().superRefine((value, context) => {
	if (value.endMs <= value.startMs) {
		context.addIssue({ code: 'custom', path: ['endMs'], message: 'Event interval must be positive.' });
	}
	const admitted = value.reviewStatus === 'APPROVED' && value.sceneAdmission === 'APPROVED_FOR_SCENE_PROPOSAL';
	const unadmitted = value.reviewStatus !== 'APPROVED' && value.sceneAdmission === 'NOT_ADMITTED';
	if (!admitted && !unadmitted) {
		context.addIssue({ code: 'custom', path: ['sceneAdmission'], message: 'Scene admission must follow event review status.' });
	}
	if (value.reviewStatus === 'UNREVIEWED_PROPOSAL' && (value.reviewedBy !== undefined || value.reviewedAt !== undefined)) {
		context.addIssue({ code: 'custom', path: ['reviewedBy'], message: 'Unreviewed proposals cannot carry review metadata.' });
	}
});

export const videoEventTimelineV1Schema = z.object({
	schema: z.literal('atlas.video-event-timeline.v1'),
	processingRevision: z.literal(VIDEO_EVENT_FUSION_REVISION_V1),
	evidenceId: z.string().uuid(),
	caseId: z.string().uuid(),
	sourceRevision: sha256Schema,
	analysisRevision: z.string().min(1).max(256),
	status: z.enum(['PROPOSED', 'PARTIAL', 'EMPTY']),
	canonicalAuthority: z.literal(false),
	orderingSemantics: z.literal('SOURCE_TIME_DISPLAY_ONLY_NOT_CAUSAL'),
	bucketWidthMs: z.literal(VIDEO_EVENT_FUSION_BUCKET_MS_V1),
	omittedObservationCount: z.number().int().nonnegative(),
	events: z.array(videoEventSchema).max(4096),
}).strict().superRefine((timeline, context) => {
	const eventIds = new Set<string>();
	for (const [index, event] of timeline.events.entries()) {
		if (eventIds.has(event.eventId)) {
			context.addIssue({ code: 'custom', path: ['events', index, 'eventId'], message: 'Event IDs must be unique.' });
		}
		eventIds.add(event.eventId);
		for (const reference of event.sourceReferences) {
			if (reference.kind !== 'transcript_segment' && reference.modelRevision !== null && !reference.modelRevision.trim()) {
				context.addIssue({ code: 'custom', path: ['events', index, 'sourceReferences'], message: 'Model revisions must be null or non-empty.' });
			}
		}
	}
});

export type VideoEventTimelineV1 = z.infer<typeof videoEventTimelineV1Schema>;

/**
 * Builds a deterministic, source-cited observation timeline. It associates records in the same
 * ten-second display window but never infers an action, identity, cause, or legal conclusion.
 */
export function fuseVideoEventsV1(input: {
	evidenceId: string;
	caseId: string;
	transcriptId: string;
	sourceRevision: string;
	analysisRevision: string;
	frames: unknown[];
	transcriptSegments: unknown[];
}): VideoEventTimelineV1 {
	const evidenceId = z.string().uuid().parse(input.evidenceId);
	const caseId = z.string().uuid().parse(input.caseId);
	const transcriptId = z.string().uuid().parse(input.transcriptId);
	const sourceRevision = sha256Schema.parse(input.sourceRevision);
	const analysisRevision = z.string().min(1).max(256).parse(input.analysisRevision);
	const frames = z.array(frameInputSchema).parse(input.frames);
	const transcriptSegments = z.array(transcriptInputSchema).parse(input.transcriptSegments);
	const grouped = new Map<number, { sources: z.infer<typeof eventSourceSchema>[]; startMs: number; endMs: number }>();
	let omittedObservationCount = 0;

	const addSource = (timestampMs: number, source: z.infer<typeof eventSourceSchema>, endMs = timestampMs + 1) => {
		const bucket = Math.floor(timestampMs / VIDEO_EVENT_FUSION_BUCKET_MS_V1);
		const group = grouped.get(bucket) ?? { sources: [], startMs: timestampMs, endMs };
		if (group.sources.length >= 256) {
			omittedObservationCount += 1;
			return;
		}
		group.sources.push(source);
		group.startMs = Math.min(group.startMs, timestampMs);
		group.endMs = Math.max(group.endMs, endMs);
		grouped.set(bucket, group);
	};

	for (const segment of transcriptSegments) {
		const parsed = transcriptInputSchema.parse(segment);
		if (!parsed.text.trim()) continue;
		addSource(parsed.startMs, {
			kind: 'transcript_segment',
			referenceId: uuidv5(`${evidenceId}\u0000${sourceRevision}\u0000${analysisRevision}\u0000transcript\u0000${transcriptId}\u0000${parsed.segmentIndex}`, namespace),
			transcriptId,
			segmentIndex: parsed.segmentIndex,
			startMs: parsed.startMs,
			endMs: parsed.endMs,
			text: parsed.text,
			modelRevision: parsed.model?.trim() || null,
		}, parsed.endMs);
	}

	for (const frameValue of frames) {
		const frame = frameInputSchema.parse(frameValue);
		if (frame.sourceRevision !== sourceRevision || frame.analysisRevision !== analysisRevision) {
			throw new Error('VIDEO_EVENT_FUSION_SOURCE_REVISION_MISMATCH');
		}
		for (const [detectionIndex, detection] of frame.objects.entries()) {
			addSource(frame.timestampMs, {
				kind: 'frame_detection',
				referenceId: uuidv5(`${evidenceId}\u0000${sourceRevision}\u0000${analysisRevision}\u0000frame\u0000${frame.frameIndex}\u0000detection\u0000${detectionIndex}`, namespace),
				frameIndex: frame.frameIndex,
				timestampMs: frame.timestampMs,
				artifactSha256: frame.artifact.sha256,
				modelRevision: frame.modelRevision?.trim() || null,
				label: detection.label,
				confidence: detection.confidence,
				bbox: detection.bbox,
			});
		}
		if (frame.ocr?.status === 'COMPLETED' && frame.ocr.text.trim()) {
			addSource(frame.timestampMs, {
				kind: 'frame_ocr',
				referenceId: uuidv5(`${evidenceId}\u0000${sourceRevision}\u0000${analysisRevision}\u0000frame\u0000${frame.frameIndex}\u0000ocr`, namespace),
				frameIndex: frame.frameIndex,
				timestampMs: frame.timestampMs,
				artifactSha256: frame.artifact.sha256,
				text: frame.ocr.text,
				modelRevision: 'tesseract',
			});
		}
	}

	const buckets = [...grouped.entries()].sort(([left], [right]) => left - right);
	if (buckets.length > 4096) {
		omittedObservationCount += buckets.slice(4096).reduce((count, [, group]) => count + group.sources.length, 0);
	}
	const events = buckets.slice(0, 4096).map(([bucket, group]) => {
		const sourceReferences = group.sources.sort((left, right) => {
			const leftTime = left.kind === 'transcript_segment' ? left.startMs : left.timestampMs;
			const rightTime = right.kind === 'transcript_segment' ? right.startMs : right.timestampMs;
			return leftTime - rightTime || left.referenceId.localeCompare(right.referenceId);
		});
		const transcriptText = sourceReferences
			.filter((source): source is Extract<typeof source, { kind: 'transcript_segment' }> => source.kind === 'transcript_segment')
			.map((source) => source.text.replace(/\s+/g, ' ').trim().slice(0, 600));
		const labels = [...new Set(sourceReferences
			.filter((source): source is Extract<typeof source, { kind: 'frame_detection' }> => source.kind === 'frame_detection')
			.map((source) => source.label))].sort();
		const ocrSources = sourceReferences.filter((source): source is Extract<typeof source, { kind: 'frame_ocr' }> => source.kind === 'frame_ocr');
		const parts = [
			transcriptText.length ? `Unreviewed transcript excerpt: “${transcriptText.join(' … ')}”` : '',
			labels.length ? `Unreviewed frame detector labels: ${labels.join(', ')}` : '',
			ocrSources.length ? `Unreviewed frame text: “${ocrSources.map((source) => source.text.replace(/\s+/g, ' ').trim().slice(0, 400)).join(' … ')}”` : '',
		].filter(Boolean);
		const startMs = group.startMs;
		const endMs = Math.max(group.endMs, startMs + 1);
		return {
			eventId: uuidv5(`${evidenceId}\u0000${sourceRevision}\u0000${analysisRevision}\u0000${bucket}`, namespace),
			startMs,
			endMs,
			label: `Evidence observations ${formatMs(startMs)}–${formatMs(endMs)}`,
			summary: parts.join(' · ').slice(0, 4000) || 'Source-linked observations are available for review.',
			sourceReferences,
			reviewStatus: 'UNREVIEWED_PROPOSAL' as const,
			sceneAdmission: 'NOT_ADMITTED' as const,
		};
	});

	return videoEventTimelineV1Schema.parse({
		schema: 'atlas.video-event-timeline.v1',
		processingRevision: VIDEO_EVENT_FUSION_REVISION_V1,
		evidenceId,
		caseId,
		sourceRevision,
		analysisRevision,
		status: omittedObservationCount > 0 ? 'PARTIAL' : events.length > 0 ? 'PROPOSED' : 'EMPTY',
		canonicalAuthority: false,
		orderingSemantics: 'SOURCE_TIME_DISPLAY_ONLY_NOT_CAUSAL',
		bucketWidthMs: VIDEO_EVENT_FUSION_BUCKET_MS_V1,
		omittedObservationCount,
		events,
	});
}

function formatMs(milliseconds: number): string {
	const totalSeconds = Math.floor(milliseconds / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	const millis = milliseconds % 1000;
	return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}
