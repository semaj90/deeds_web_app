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
