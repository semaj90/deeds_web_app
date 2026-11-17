type Metadata = Record<string, unknown>;

export interface VideoAnalysisEvidenceRowV1 {
	id: string;
	status: string;
	storageUri: string;
	metadataJson: unknown;
	createdAt: Date | string;
}

export interface VideoTranscriptRowV1 {
	startMs: number;
	endMs: number;
	text: string;
	language: string | null;
	confidence: string | number | null;
	model: string | null;
}

export interface VideoFrameRowV1 {
	timestampMs: number;
	storageUri: string;
	caption: string | null;
	objectsJson: unknown;
	tagsJson: unknown;
	confidence: string | number | null;
}

function asRecord(value: unknown): Metadata {
	if (typeof value === 'string') {
		try {
			const parsed: unknown = JSON.parse(value);
			return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Metadata : {};
		} catch {
			return {};
		}
	}
	return value && typeof value === 'object' && !Array.isArray(value) ? value as Metadata : {};
}

function asStringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function buildVideoAnalysisReadModelV1(input: {
	evidence: VideoAnalysisEvidenceRowV1;
	transcript: VideoTranscriptRowV1[];
	frames: VideoFrameRowV1[];
	originalMimeType: string | null;
}) {
	const metadata = asRecord(input.evidence.metadataJson);
	const summary = typeof metadata.summary === 'string' ? metadata.summary : '';
	const transcriptionText = input.transcript.map((segment) => segment.text).filter(Boolean).join('\n');
	const legacyTranscription = asRecord(metadata.transcription);
	const transcription = transcriptionText || typeof legacyTranscription.text === 'string'
		? { text: transcriptionText || String(legacyTranscription.text) }
		: null;

	return {
		evidenceId: input.evidence.id,
		title: typeof metadata.title === 'string' ? metadata.title : String(metadata.originalFileName ?? 'Video evidence'),
		fileName: String(metadata.originalFileName ?? ''),
		filePath: input.evidence.storageUri,
		fileSize: typeof metadata.fileSize === 'number' ? metadata.fileSize : 0,
		mimeType: input.originalMimeType ?? String(metadata.mimeType ?? ''),
		processingStatus: typeof metadata.processingStatus === 'string' ? metadata.processingStatus : input.evidence.status,
		transcription,
		transcriptSegments: input.transcript.map((segment) => ({
			startMs: segment.startMs,
			endMs: segment.endMs,
			text: segment.text,
			language: segment.language,
			confidence: segment.confidence,
			model: segment.model
		})),
		transcriptSummary: summary || null,
		summaryRevision: typeof metadata.summaryRevision === 'string' ? metadata.summaryRevision : null,
		keyFacts: asStringArray(metadata.keyFacts),
		vlmAnalysis: metadata.vlmAnalysis ?? null,
		frameAnalysis: input.frames.map((frame) => ({
			timestamp: frame.timestampMs / 1000,
			framePath: frame.storageUri,
			description: frame.caption ?? '',
			objects: asStringArray(frame.objectsJson),
			tags: asStringArray(frame.tagsJson),
			confidence: Number(frame.confidence ?? 0)
		})),
		sceneDetection: Array.isArray(metadata.sceneDetection) ? metadata.sceneDetection : [],
		entities: asStringArray(metadata.entities),
		aceAnalysis: metadata.aceAnalysis ?? null,
		videoMetadata: asRecord(metadata.videoMetadata),
		createdAt: input.evidence.createdAt
	};
}

function record(value: unknown): Metadata {
	return value && typeof value === 'object' && !Array.isArray(value) ? value as Metadata : {};
}

/**
 * Adapts the durable video worker's canonical `evidence.ai_analysis.videoAnalysis`
 * payload plus `whisper_segments` rows to the existing video-analysis page DTO.
 * Source-derived frame artifacts remain behind authorized media routes; this
 * adapter intentionally never returns a raw SeaweedFS URI as an image URL.
 */
export function buildCanonicalVideoAnalysisReadModelV1(input: {
	evidence: {
		id: string;
		title: string;
		fileName: string | null;
		mimeType: string | null;
		fileSize: number | null;
		status: string | null;
		fileUrl: string | null;
		createdAt: Date | string;
		metadata: unknown;
		aiAnalysis: unknown;
		hash: string | null;
	};
	transcript: VideoTranscriptRowV1[];
}) {
	const metadata = record(input.evidence.metadata);
	const analysisRoot = record(input.evidence.aiAnalysis);
	const video = record(analysisRoot.videoAnalysis);
	const frames = Array.isArray(video.frames) ? video.frames.filter((candidate) => {
		const frame = record(candidate);
		return typeof video.sourceRevision === 'string' && typeof video.analysisRevision === 'string' &&
			frame.sourceRevision === video.sourceRevision && frame.analysisRevision === video.analysisRevision;
	}).map((candidate) => {
		const frame = record(candidate);
		const objects = Array.isArray(frame.objects) ? frame.objects.map(record) : [];
		const labels = objects.flatMap((object) => typeof object.label === 'string' ? [object.label] : []);
		const ocr = record(frame.ocr);
		const ocrText = ocr.status === 'COMPLETED' && typeof ocr.text === 'string' ? ocr.text : '';
		const confidenceValues = objects.flatMap((object) => typeof object.confidence === 'number' && Number.isFinite(object.confidence) ? [object.confidence] : []);
		return {
			timestampMs: typeof frame.timestampMs === 'number' ? frame.timestampMs : 0,
			// The UI may request the authorized frame route; do not expose an object-store URI.
			storageUri: '',
			caption: ocrText || (labels.length ? `Unreviewed detections: ${labels.join(', ')}` : 'Sampled frame; no reviewed finding is recorded.'),
			objectsJson: labels,
			tagsJson: [typeof frame.reviewState === 'string' ? frame.reviewState : 'UNREVIEWED_PROPOSAL'],
			confidence: confidenceValues.length ? Math.max(...confidenceValues) : 0,
		};
	}) : [];
	const readModel = buildVideoAnalysisReadModelV1({
		evidence: {
			id: input.evidence.id,
			status: typeof video.status === 'string' ? video.status : input.evidence.status ?? 'unknown',
			storageUri: '',
			metadataJson: {
				title: input.evidence.title,
				originalFileName: input.evidence.fileName ?? metadata.originalFileName ?? '',
				fileSize: input.evidence.fileSize ?? 0,
				mimeType: input.evidence.mimeType ?? '',
				processingStatus: typeof video.status === 'string' ? video.status : input.evidence.status ?? 'unknown',
			},
			createdAt: input.evidence.createdAt,
		},
		transcript: input.transcript,
		frames,
		originalMimeType: input.evidence.mimeType,
	});
	const probe = record(video.probe);
	const eventTimeline = record(video.eventTimeline);
	const events = eventTimeline.sourceRevision === video.sourceRevision && eventTimeline.analysisRevision === video.analysisRevision && Array.isArray(eventTimeline.events)
		? eventTimeline.events.map(record)
		: [];
	return {
		...readModel,
		processingStatus: typeof video.status === 'string' ? video.status : input.evidence.status ?? 'unknown',
		// Keep source identity available to the authorized client without exposing object keys.
		sourceRevision: typeof video.sourceRevision === 'string' ? video.sourceRevision : null,
		analysisRevision: typeof video.analysisRevision === 'string' ? video.analysisRevision : null,
		transcriptionStatus: typeof video.transcriptionStatus === 'string' ? video.transcriptionStatus : 'NOT_RUN',
		frameAnalysis: readModel.frameAnalysis.map((frame, index) => ({
			...frame,
			frameIndex: index,
			framePath: `/api/evidence/${encodeURIComponent(input.evidence.id)}/video-frame/${index}`,
		})),
		sceneDetection: events.map((event) => ({
			startTime: typeof event.startMs === 'number' ? event.startMs / 1000 : 0,
			endTime: typeof event.endMs === 'number' ? event.endMs / 1000 : 0,
			description: typeof event.summary === 'string' ? event.summary : String(event.label ?? 'Source-linked event proposal'),
			reviewState: typeof event.reviewState === 'string' ? event.reviewState : 'UNREVIEWED_PROPOSAL',
			sourceReferences: Array.isArray(event.sourceReferences) ? event.sourceReferences : [],
		})),
		videoMetadata: {
			duration: typeof probe.durationSeconds === 'number' ? probe.durationSeconds : 0,
			width: typeof probe.width === 'number' ? probe.width : 0,
			height: typeof probe.height === 'number' ? probe.height : 0,
			fps: typeof probe.frameRate === 'number' ? probe.frameRate : 0,
			codec: typeof probe.videoCodec === 'string' ? probe.videoCodec : '',
		},
	};
}
