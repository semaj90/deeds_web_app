import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';
import { createAudioWindowLedgerIfAvailableV1, type AudioWindowLedgerDatabaseV1 } from './audio-window-ledger-v1.js';
import { audioTranscripts, evidence, whisperSegments } from '$lib/server/db/schema-postgres.js';
import { ensureCaseOwned } from './video-ingest-service.js';
import { ENV } from '$lib/server/env.server.js';
import { stableStringify } from '$lib/server/analysis/stable-hash.js';
import { ARTIFACTS_BUCKET, assertArtifactBucket } from '$lib/server/storage/storage-buckets.js';
import { statSeaweedObject, uploadSeaweedFile } from '$lib/server/seaweed-client.js';
import { extractAudioTrack, transcribeVideoAudio } from './transcript-service.js';
import { detectVideoAndAudioStreamsV1 } from './storyboard-manifest-contract-v1.js';
import { fuseVideoEventsV1, videoEventTimelineV1Schema } from './video-event-fusion-v1.js';
import { linkVideoFrameTracksV1, VIDEO_TRACK_LINKER_REVISION_V1 } from './video-track-linker-v1.js';
import {
	encodeVideoMotionLutV1,
	VIDEO_MOTION_LUT_HEIGHT_V1,
	VIDEO_MOTION_LUT_PROCESSING_REVISION_V1,
	VIDEO_MOTION_LUT_WIDTH_V1,
	type VideoMotionSampleManifestV1,
	type VideoMotionLutManifestV1,
} from '$lib/shared/video-motion-lut-v1.js';
import type { AnalysisJobProgressStageV1 } from '$lib/server/analysis/analysis-job-progress-events-v1.js';
import {
	embedEvidenceAudioWithEmbeddingGemma2OnnxV1,
	embedEvidenceImageWithEmbeddingGemma2OnnxV1,
	embedEvidenceTextWithEmbeddingGemma2OnnxV1,
	EMBEDDINGGEMMA2_ONNX_AUDIO_MAX_SAMPLES_V1,
	EMBEDDINGGEMMA2_ONNX_AUDIO_PREPROCESSING_REVISION_V1,
	EMBEDDINGGEMMA2_ONNX_AUDIO_SAMPLE_RATE_V1,
	EMBEDDINGGEMMA2_ONNX_MODEL_ARTIFACT_SHA256_V1,
	readPcm16MonoWavWindowV1,
} from '$lib/server/evidence/embeddinggemma2-onnx-image-v1.js';
import {
	embedEvidenceAudioViaEg2WorkerV1,
	embedEvidenceImageViaEg2WorkerV1,
	embedEvidenceTextViaEg2WorkerV1,
} from '$lib/server/evidence/eg2-onnx-worker-client.js';
import { persistEvidenceMultimodalVectorV1 } from '$lib/server/evidence/evidence-multimodal-vector-persistence-v1.js';
import { EVIDENCE_AUDIO_CONTENT_REPRESENTATION_V1 } from '$lib/server/evidence/evidence-multimodal-vector-persistence-v1.js';
import {
	createVideoSkimPreviewTileV1,
	extractVideoSkimPreviewV1,
	VIDEO_SKIM_PREVIEW_FRAME_HEIGHT_V1,
	VIDEO_SKIM_PREVIEW_FRAME_WIDTH_V1,
	VIDEO_SKIM_PREVIEW_PROCESSING_REVISION_V1,
	VIDEO_SKIM_PREVIEW_SCHEMA_V1,
	VIDEO_SKIM_PREVIEW_TILE_COLUMNS_V1,
	VIDEO_SKIM_PREVIEW_TILE_FRAMES_V1,
	VIDEO_SKIM_PREVIEW_TILE_HEIGHT_V1,
	VIDEO_SKIM_PREVIEW_TILE_ROWS_V1,
	VIDEO_SKIM_PREVIEW_TILE_WIDTH_V1,
	videoSkimPreviewManifestV1Schema,
	type VideoSkimPreviewManifestV1,
	type VideoSkimPreviewTileV1,
} from './video-skim-preview-v1.js';

const MAX_VIDEO_BYTES_V1 = 2 * 1024 * 1024 * 1024;
const MAX_FRAME_SAMPLES_V1 = 60;
const MAX_MOTION_FRAME_SAMPLES_V1 = 300;
const MAX_AUDIO_ARTIFACT_BYTES_V1 = 512 * 1024 * 1024;
const MAX_VIDEO_TRANSCRIPT_EMBEDDINGS_V1 = 32;
const MAX_FRAME_OCR_CHARS_V1 = 4000;
const MAX_VIDEO_AUDIO_EMBEDDINGS_V1 = 8;
const VIDEO_ANALYSIS_REVISION_V1 = 'video-analysis-v1';
export const VIDEO_FRAME_SAMPLING_POLICY_V1 = 'ffmpeg-evenly-spaced-max-60-target-2fps-v1' as const;
export const VIDEO_MOTION_SAMPLING_POLICY_V1 = 'ffmpeg-evenly-spaced-motion-max-300-target-2fps-v1' as const;
export const VIDEO_AUDIO_EMBEDDING_SAMPLING_POLICY_V1 = 'pcm16-16khz-nonoverlap-even-windows-max-8x30s-v1' as const;

/** Explicit audio coverage of the bounded sampling policy; a sample is never reported as full-recording coverage. */
export type VideoAudioEmbeddingCoverageV1 = {
	policy: typeof VIDEO_AUDIO_EMBEDDING_SAMPLING_POLICY_V1;
	sourceDurationMs: number;
	candidateWindowCount: number;
	selectedWindowCount: number;
	completedWindowCount: number;
	failedWindowCount: number;
	resumedWindowCount: number;
	coveredMs: number;
};

export function computeVideoFrameSampleRateV1(durationSeconds: number, maxFrames = MAX_FRAME_SAMPLES_V1): number {
	if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isSafeInteger(maxFrames) || maxFrames < 1) {
		throw new Error('VIDEO_FRAME_SAMPLING_INPUT_INVALID');
	}
	return Math.max(1 / 3600, Math.min(2, maxFrames / durationSeconds));
}

export function computeVideoMotionSampleRateV1(durationSeconds: number, maxFrames = MAX_MOTION_FRAME_SAMPLES_V1): number {
	if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isSafeInteger(maxFrames) || maxFrames < 1) {
		throw new Error('VIDEO_MOTION_SAMPLING_INPUT_INVALID');
	}
	return Math.max(1 / 3600, Math.min(2, maxFrames / durationSeconds));
}

export interface VideoDerivedArtifactV1 {
	bucket: string;
	objectKey: string;
	storageUri: string;
	contentType: string;
	sha256: string;
	byteLength: number;
	width?: number;
	height?: number;
	sourceRevision: string;
	analysisRevision?: string;
}

export interface VideoFrameOcrV1 {
	engine: 'tesseract';
	status: 'COMPLETED' | 'EMPTY' | 'FAILED';
	text: string;
	error?: string;
}

export interface VideoFrameProposalV1 {
	frameIndex: number;
	timestampMs: number;
	width: number;
	height: number;
	objects: Array<{
		label: string;
		confidence: number;
		bbox: [number, number, number, number];
		trackId?: string;
		centerPx?: [number, number];
		velocityPxPerSecond?: [number, number] | null;
		trackState?: 'UNREVIEWED_TRACK_HYPOTHESIS';
	}>;
	trackScopeId?: string;
	modelRevision: string | null;
	artifact: VideoDerivedArtifactV1;
	motionLut?: VideoMotionLutManifestV1;
	ocr?: VideoFrameOcrV1;
	sourceRevision: string;
	analysisRevision: string;
	reviewState: 'UNREVIEWED_PROPOSAL';
}

export interface CanonicalVideoAnalysisV1Input {
	evidenceId: string;
	caseId: string;
	analysisJobId: string;
	uploadedBy: number;
	sourceRevision: string;
	fileName: string;
	bytes: Buffer;
	onProgress?: (stage: AnalysisJobProgressStageV1) => Promise<void> | void;
	onFrameProgress?: (progress: VideoFrameProgressV1) => Promise<void> | void;
}

export interface CanonicalVideoAnalysisV1Receipt {
	canonicalReceiptVerified: true;
	chunkCount: number;
	persistedCount: number;
	sourceRevision: string;
	analysisRevision: string;
	representationId: string;
	canonicalStore: string;
	readback: {
		evidenceRowCount: number;
		frameFindingCount: number;
		transcriptRowCount: number;
		transcriptSegmentCount: number;
		canonicalRecordCount: number;
		vectorCount: number;
	};
	analysis: {
		status: 'COMPLETE' | 'PARTIAL';
		transcriptionStatus: 'COMPLETED' | 'SKIPPED_NO_AUDIO' | 'TRANSCRIPTION_BINARY_UNAVAILABLE' | 'FAILED';
		transcriptSegmentCount: number;
		detectorStatus: 'COMPLETED' | 'UNAVAILABLE' | 'FAILED';
		frameCount: number;
		coverage: 'BOUNDED_SAMPLE_NOT_FULL_VIDEO_COVERAGE';
		skimPreviewStatus: 'COMPLETED' | 'FAILED' | 'UNAVAILABLE';
		skimPreviewSampleCount: number;
		embeddingStatus?: 'COMPLETED' | 'UNAVAILABLE' | 'SKIPPED_NO_CONTENT';
		embeddingError?: string;
		audioEmbeddingStatus?: 'COMPLETED' | 'UNAVAILABLE' | 'SKIPPED_NO_AUDIO' | 'SKIPPED_FEATURE_DISABLED';
		audioEmbeddingError?: string;
		embeddedVectorCount?: number;
	frameSamplingPolicy: typeof VIDEO_FRAME_SAMPLING_POLICY_V1;
	frameSampleRateFps: number;
		motionSampleStatus: 'COMPLETED' | 'FAILED' | 'UNAVAILABLE';
		motionSampleCount: number;
		motionSampleRateFps: number;
		substages: {
			probe: { status: 'COMPLETED'; hasVideoStream: boolean; hasAudioStream: boolean };
			keyframes: { status: 'COMPLETED' | 'FAILED'; count: number; bucket: string };
			yolo: { status: 'COMPLETED' | 'UNAVAILABLE' | 'FAILED'; error?: string };
			transcription: { status: 'COMPLETED' | 'SKIPPED_NO_AUDIO' | 'TRANSCRIPTION_BINARY_UNAVAILABLE' | 'FAILED'; error?: string };
			audioEmbedding: { status: 'COMPLETED' | 'UNAVAILABLE' | 'SKIPPED_NO_AUDIO' | 'SKIPPED_FEATURE_DISABLED'; error?: string; coverage?: VideoAudioEmbeddingCoverageV1 };
		};
	};
}

/**
 * Optional durable window ledger (task 5.6). When absent, behaviour is unchanged. When present, windows
 * already COMPLETED for the same source and analysis revision are skipped, and every outcome is recorded.
 */
export interface AudioWindowLedgerV1 {
	completedWindowIndexes(input: { evidenceId: string; sourceRevision: string; analysisRevision: string }): Promise<Set<number>>;
	recordWindow(input: {
		evidenceId: string;
		sourceRevision: string;
		analysisRevision: string;
		analysisJobId: string;
		windowIndex: number;
		startSample: number;
		sampleCount: number;
		status: 'COMPLETED' | 'FAILED';
		vectorLocatorSha256?: string;
		error?: string;
	}): Promise<void>;
}

async function loadAudioWindowLedgerOrUndefinedV1(database: typeof db): Promise<AudioWindowLedgerV1 | undefined> {
	try {
		return await createAudioWindowLedgerIfAvailableV1(database as unknown as AudioWindowLedgerDatabaseV1);
	} catch (error) {
		// Resume is an optimisation; a probe failure disables it for this job and never fails the stage.
		console.warn('[VideoAnalysis] audio window ledger unavailable; resume disabled:', error instanceof Error ? error.message : String(error));
		return undefined;
	}
}

export interface VideoAnalysisDependenciesV1 {
	database: typeof db;
	ensureCaseOwned(caseId: string, ownerId: string): Promise<void>;
	modelDir: string | null;
	audioEmbeddingsEnabled: boolean;
	audioWindowLedger?: AudioWindowLedgerV1;
	probe(path: string): ReturnType<typeof detectVideoAndAudioStreamsV1>;
	extractFrames(bytes: Buffer, options: { fps: number; maxFrames: number; scaleWidth?: number }): Promise<Array<{ timestampMs: number; buffer: Buffer }>>;
	extractSkimPreview?(input: {
		videoPath: string;
		durationSeconds: number;
		onTile(tile: { index: number; bytes: Buffer; sampleTimestampsMs: number[]; firstSampleIndex: number }): Promise<void>;
	}): Promise<{ sampleIntervalMs: number; sampleTimestampsMs: number[]; tileCount: number }>;
	frameDimensions(buffer: Buffer): Promise<{ width: number; height: number }>;
		ocrFrame?(buffer: Buffer): Promise<{ text: string; error?: string }>;
	extractAudio(path: string, workDir: string): Promise<string>;
	transcribe(path: string, jobId: string): ReturnType<typeof transcribeVideoAudio>;
	readArtifactFile(path: string): Promise<Buffer>;
	artifactFileSize(path: string): Promise<number>;
	embedFrame(buffer: Buffer, modelDir: string): ReturnType<typeof embedEvidenceImageWithEmbeddingGemma2OnnxV1>;
	embedAudio(pcm: Float32Array, sampleRate: number, modelDir: string): ReturnType<typeof embedEvidenceAudioWithEmbeddingGemma2OnnxV1>;
	embedTranscript(text: string, modelDir: string): ReturnType<typeof embedEvidenceTextWithEmbeddingGemma2OnnxV1>;
	persistVector: typeof persistEvidenceMultimodalVectorV1;
	uploadArtifact(bucket: string, objectKey: string, bytes: Buffer, metadata: Record<string, string>): Promise<void>;
	statArtifact(bucket: string, objectKey: string): Promise<{ size: number }>;
	loadDetector(): Promise<{
		modelRevision: string | null;
		analyze(buffer: Buffer, fileName: string): Promise<{
			objects: Array<{ class: string; bbox: number[]; confidence: number }>;
		}>;
	} | null>;
	persist(input: {
		evidenceId: string;
		caseId: string;
		analysisJobId: string;
		sourceRevision: string;
		analysisRevision: string;
		samplingFps: number;
		probe: Awaited<ReturnType<typeof detectVideoAndAudioStreamsV1>>;
		transcript: Awaited<ReturnType<typeof transcribeVideoAudio>> | null;
		audioArtifact: VideoDerivedArtifactV1 | null;
		frames: VideoFrameProposalV1[];
		motionSamples: VideoMotionSampleManifestV1[];
		motionSampleFps: number;
		motionSamplingPolicy: typeof VIDEO_MOTION_SAMPLING_POLICY_V1;
		motionSampleStatus: 'COMPLETED' | 'FAILED' | 'UNAVAILABLE';
		transcriptionStatus: 'COMPLETED' | 'SKIPPED_NO_AUDIO' | 'TRANSCRIPTION_BINARY_UNAVAILABLE' | 'FAILED';
		transcriptionError?: string;
		detectorStatus: 'COMPLETED' | 'UNAVAILABLE' | 'FAILED';
		detectorError?: string;
		embeddingStatus?: 'COMPLETED' | 'UNAVAILABLE' | 'SKIPPED_NO_CONTENT';
		embeddingError?: string;
		audioEmbeddingStatus?: 'COMPLETED' | 'UNAVAILABLE' | 'SKIPPED_NO_AUDIO' | 'SKIPPED_FEATURE_DISABLED';
		audioEmbeddingError?: string;
		embeddedVectorCount?: number;
		skimPreview: VideoSkimPreviewManifestV1 | null;
		skimPreviewStatus: 'COMPLETED' | 'FAILED' | 'UNAVAILABLE';
		skimPreviewError?: string;
	}, database: typeof db): Promise<{
		evidenceRowCount: number;
		frameFindingCount: number;
		transcriptRowCount: number;
		transcriptSegmentCount: number;
	skimTileCount: number;
	skimSampleCount: number;
	}>;
}

function sha256(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex');
}

export interface VideoFrameProgressV1 {
	phase: 'frame_ocr' | 'frame_embedding';
	completed: number;
	total: number;
	percent: number;
	etaMs: number | null;
}

/** Linear ETA from elapsed time per completed frame. Null until one frame has finished. */
export function frameProgressV1(
	phase: VideoFrameProgressV1['phase'],
	completed: number,
	total: number,
	startedAtMs: number,
	nowMs: number = Date.now(),
): VideoFrameProgressV1 {
	const percent = total > 0 ? Math.round((100 * completed) / total) : 100;
	let etaMs: number | null = null;
	if (completed >= total) etaMs = 0;
	else if (completed > 0) etaMs = Math.round(((nowMs - startedAtMs) / completed) * (total - completed));
	return { phase, completed, total, percent, etaMs };
}

function selectEvenly<T>(items: T[], limit: number): T[] {
	if (items.length <= limit) return items;
	if (limit === 1) return [items[Math.floor((items.length - 1) / 2)]];
	return Array.from({ length: limit }, (_, index) => items[Math.round(index * (items.length - 1) / (limit - 1))]);
}

function derivedObjectKey(input: CanonicalVideoAnalysisV1Input, kind: 'audio' | 'frame' | 'motion' | 'motion-sample', index?: number): string {
	const sourceHash = input.sourceRevision.slice('sha256:'.length);
	const name = kind === 'audio' ? 'audio.wav' : kind === 'motion-sample'
		? `motion-sample-${String(index ?? 0).padStart(4, '0')}.atm`
		: kind === 'motion'
		? `motion-${String(index ?? 0).padStart(4, '0')}.atm`
		: `frame-${String(index ?? 0).padStart(4, '0')}.jpg`;
	return `evidence/${input.caseId}/${input.evidenceId}/${sourceHash}/${input.analysisJobId}/${name}`;
}

async function storeDerivedArtifactV1(input: {
	job: CanonicalVideoAnalysisV1Input;
	kind: 'audio' | 'frame' | 'motion' | 'motion-sample';
	index?: number;
	bytes: Buffer;
	contentType: string;
	width?: number;
	height?: number;
	upload: VideoAnalysisDependenciesV1['uploadArtifact'];
	stat: VideoAnalysisDependenciesV1['statArtifact'];
}): Promise<VideoDerivedArtifactV1> {
	const bucket = ENV.SEAWEED_ARTIFACTS_BUCKET || ARTIFACTS_BUCKET;
	assertArtifactBucket(bucket);
	const objectKey = derivedObjectKey(input.job, input.kind, input.index);
	const digest = `sha256:${sha256(input.bytes)}`;
	await input.upload(bucket, objectKey, input.bytes, {
		'Content-Type': input.contentType,
		'x-evidence-id': input.job.evidenceId,
		'x-case-id': input.job.caseId,
		'x-source-revision': input.job.sourceRevision,
		'x-artifact-sha256': digest,
		...(input.width ? { 'x-image-width': String(input.width) } : {}),
		...(input.height ? { 'x-image-height': String(input.height) } : {}),
	});
	const readback = await input.stat(bucket, objectKey);
	if (readback.size !== input.bytes.byteLength) throw new Error('VIDEO_DERIVED_ARTIFACT_READBACK_SIZE_MISMATCH');
	return {
		bucket,
		objectKey,
		storageUri: `seaweedfs://${bucket}/${objectKey}`,
		contentType: input.contentType,
		sha256: digest,
		byteLength: input.bytes.byteLength,
		...(input.width ? { width: input.width } : {}),
		...(input.height ? { height: input.height } : {}),
		sourceRevision: input.job.sourceRevision,
	};
}

function toSourceBox(
	box: number[],
	sourceWidth: number,
	sourceHeight: number,
	resizedWidth: number,
	resizedHeight: number,
): [number, number, number, number] | null {
	if (box.length !== 4 || box.some((value) => !Number.isFinite(value))) return null;
	const scaleX = sourceWidth / resizedWidth;
	const scaleY = sourceHeight / resizedHeight;
	const x1 = Math.max(0, Math.min(sourceWidth, Math.floor(box[0] * scaleX)));
	const y1 = Math.max(0, Math.min(sourceHeight, Math.floor(box[1] * scaleY)));
	const x2 = Math.max(0, Math.min(sourceWidth, Math.ceil(box[2] * scaleX)));
	const y2 = Math.max(0, Math.min(sourceHeight, Math.ceil(box[3] * scaleY)));
	return x2 > x1 && y2 > y1 ? [x1, y1, x2, y2] : null;
}

async function loadDetectorV1(): Promise<NonNullable<VideoAnalysisDependenciesV1['loadDetector']> extends () => Promise<infer T> ? T : never> {
	try {
		const { createYOLOService } = await import('$lib/server/yolo.js');
		const detector = createYOLOService();
		if (!(await detector.isModelAvailable())) return null;
		const modelRevision = await detector.getModelArtifactRevision();
		if (!modelRevision) return null;
		return {
			modelRevision,
			analyze: async (buffer, fileName) => detector.analyzeDocument(buffer, fileName),
		};
	} catch {
		return null;
	}
}

export async function persistCanonicalVideoAnalysisV1(
	input: Parameters<VideoAnalysisDependenciesV1['persist']>[0],
	database: typeof db = db,
): Promise<{
	evidenceRowCount: number;
	frameFindingCount: number;
	transcriptRowCount: number;
	transcriptSegmentCount: number;
	skimTileCount: number;
	skimSampleCount: number;
}> {
	const eventTimeline = fuseVideoEventsV1({
		evidenceId: input.evidenceId,
		caseId: input.caseId,
		transcriptId: input.analysisJobId,
		sourceRevision: input.sourceRevision,
		analysisRevision: input.analysisRevision,
		frames: input.frames,
		transcriptSegments: input.transcript?.chunks.map((chunk, segmentIndex) => ({
			segmentIndex,
			startMs: chunk.startMs,
			endMs: chunk.endMs,
			text: chunk.text,
			model: chunk.model ?? ENV.WHISPER_MODEL ?? null,
		})) ?? [],
	});
	await database.transaction(async (tx) => {
		if (input.transcript) {
			await tx.insert(audioTranscripts).values({
				id: input.analysisJobId,
				evidenceId: input.evidenceId,
				caseId: input.caseId,
				language: input.transcript.language.slice(0, 10) || 'und',
				duration: input.probe.durationSeconds,
				fullText: input.transcript.text,
				segmentCount: input.transcript.chunks.length,
				whisperModel: (ENV.WHISPER_MODEL || 'whisper').slice(0, 50),
				metadata: {
					sourceRevision: input.sourceRevision,
					analysisRevision: input.analysisRevision,
					analysisJobId: input.analysisJobId,
					modality: 'video_audio',
					audioArtifact: input.audioArtifact,
				},
			}).onConflictDoUpdate({
				target: audioTranscripts.id,
				set: {
					evidenceId: input.evidenceId,
					caseId: input.caseId,
					language: input.transcript.language.slice(0, 10) || 'und',
					duration: input.probe.durationSeconds,
					fullText: input.transcript.text,
					segmentCount: input.transcript.chunks.length,
					whisperModel: (ENV.WHISPER_MODEL || 'whisper').slice(0, 50),
					metadata: {
						sourceRevision: input.sourceRevision,
						analysisRevision: input.analysisRevision,
						analysisJobId: input.analysisJobId,
						modality: 'video_audio',
						audioArtifact: input.audioArtifact,
					},
				},
			});
			await tx.delete(whisperSegments).where(eq(whisperSegments.transcriptId, input.analysisJobId));
			if (input.transcript.chunks.length) {
				await tx.insert(whisperSegments).values(input.transcript.chunks.map((chunk, segmentIndex) => ({
					transcriptId: input.analysisJobId,
					evidenceId: input.evidenceId,
					segmentIndex,
					startMs: chunk.startMs,
					endMs: chunk.endMs,
					text: chunk.text,
					language: chunk.language?.slice(0, 10) ?? input.transcript!.language.slice(0, 10),
					confidence: typeof chunk.confidence === 'number' ? chunk.confidence : null,
					metadata: {
						sourceRevision: input.sourceRevision,
						analysisRevision: input.analysisRevision,
						model: chunk.model ?? ENV.WHISPER_MODEL ?? 'whisper',
						locator: { kind: 'video_presentation_time_ms', startMs: chunk.startMs, endMs: chunk.endMs },
						reviewState: 'UNREVIEWED_PROPOSAL',
						...(chunk.words ? { words: chunk.words } : {}),
					},
				})));
			}
		}

		const analysis = {
			schema: 'atlas.video-analysis.v1',
			analysisRevision: input.analysisRevision,
			analysisJobId: input.analysisJobId,
			sourceRevision: input.sourceRevision,
			status: input.transcriptionStatus === 'FAILED' || input.transcriptionStatus === 'TRANSCRIPTION_BINARY_UNAVAILABLE' || input.detectorStatus !== 'COMPLETED' || input.embeddingStatus === 'UNAVAILABLE' || input.audioEmbeddingStatus === 'UNAVAILABLE' ? 'PARTIAL' : 'COMPLETE',
			substages: {
				probe: {
					status: 'COMPLETED' as const,
					hasVideoStream: input.probe.hasVideoStream,
					hasAudioStream: input.probe.hasAudioStream,
				},
				keyframes: {
					status: input.frames.length > 0 ? ('COMPLETED' as const) : ('FAILED' as const),
					count: input.frames.length,
					bucket: 'atlas-artifacts',
				},
				yolo: {
					status: input.detectorStatus,
					...(input.detectorError ? { error: input.detectorError } : {}),
				},
				transcription: {
					status: input.transcriptionStatus,
					...(input.transcriptionError ? { error: input.transcriptionError } : {}),
				},
				audioEmbedding: {
					status: input.audioEmbeddingStatus ?? (input.probe.hasAudioStream ? 'UNAVAILABLE' : 'SKIPPED_NO_AUDIO'),
					...(input.audioEmbeddingError ? { error: input.audioEmbeddingError } : {}),
				},
				eventFusion: {
					status: eventTimeline.status,
					revision: eventTimeline.processingRevision,
					eventCount: eventTimeline.events.length,
					omittedObservationCount: eventTimeline.omittedObservationCount,
				},
			},
			probe: {
				hasVideoStream: input.probe.hasVideoStream,
				hasAudioStream: input.probe.hasAudioStream,
				videoCodec: input.probe.videoCodec,
				width: input.probe.width,
				height: input.probe.height,
				durationSeconds: input.probe.durationSeconds,
				videoStartTimeSeconds: input.probe.videoStartTimeSeconds,
				audioStartTimeSeconds: input.probe.audioStartTimeSeconds,
				durationFilmcraftTicks: input.probe.durationFilmcraftTicks.toString(),
				streams: input.probe.streams,
			},
			sampling: {
				policy: VIDEO_FRAME_SAMPLING_POLICY_V1,
				maxFrames: MAX_FRAME_SAMPLES_V1,
				coverage: 'BOUNDED_SAMPLE_NOT_FULL_VIDEO_COVERAGE',
				fps: input.samplingFps,
				sampledStartMs: input.frames[0]?.timestampMs ?? null,
				sampledEndMs: input.frames.at(-1)?.timestampMs ?? null,
			},
			motionSampling: {
				policy: input.motionSamplingPolicy,
				status: input.motionSampleStatus,
				maxSamples: MAX_MOTION_FRAME_SAMPLES_V1,
				fps: input.motionSampleFps,
				sampleCount: input.motionSamples.length,
				coverage: 'BOUNDED_PIXEL_CHANGE_CUES_NOT_OBJECT_MOTION',
			},
			transcriptionStatus: input.transcriptionStatus,
			embeddingStatus: input.embeddingStatus,
			...(input.embeddingError ? { embeddingError: input.embeddingError } : {}),
			audioEmbeddingStatus: input.audioEmbeddingStatus ?? (input.probe.hasAudioStream ? 'UNAVAILABLE' : 'SKIPPED_NO_AUDIO'),
			...(input.audioEmbeddingError ? { audioEmbeddingError: input.audioEmbeddingError } : {}),
			embeddedVectorCount: input.embeddedVectorCount,
			audioArtifact: input.audioArtifact,
			...(input.transcriptionError ? { transcriptionError: input.transcriptionError } : {}),
			detectorStatus: input.detectorStatus,
			...(input.detectorError ? { detectorError: input.detectorError } : {}),
			frames: input.frames,
			motionSamples: input.motionSamples,
			eventTimeline,
			eventTimelineStatus: eventTimeline.status,
			skimPreview: input.skimPreview,
			skimPreviewStatus: input.skimPreviewStatus,
			...(input.skimPreviewError ? { skimPreviewError: input.skimPreviewError } : {}),
		};

		// Derived frame detector labels for viewer cards (prefixed `detected:`, unreviewed).
			const videoDetectorLabels = [...new Set(input.frames.flatMap((frame) =>
				((frame as { objects?: Array<{ label?: string }> }).objects ?? [])
					.map((obj) => obj.label)
					.filter((label): label is string => typeof label === 'string' && label.length > 0)
					.map((label) => `detected:${label}`)
			))];
			const updated = await tx.update(evidence).set({
				...(videoDetectorLabels.length > 0 ? { aiTags: videoDetectorLabels } : {}),
				videoCodec: analysis.probe?.videoCodec ?? null,
				audioCodec: analysis.probe?.streams?.find((stream) => stream.codecType === 'audio')?.codecName ?? null,
				durationSeconds: typeof analysis.probe?.durationSeconds === 'number' ? analysis.probe.durationSeconds.toFixed(3) : null,
				frameCount: Array.isArray(analysis.frames) ? analysis.frames.length : null,
			aiAnalysis: sql`COALESCE(${evidence.aiAnalysis}, '{}'::jsonb) || jsonb_build_object('videoAnalysis', ${JSON.stringify(analysis)}::jsonb)`,
		}).where(and(
			eq(evidence.id, input.evidenceId),
			eq(evidence.caseId, input.caseId),
			eq(evidence.hash, input.sourceRevision),
			isNull(evidence.deletedAt),
		)).returning({ id: evidence.id });
		if (!updated.length) throw new Error('EVIDENCE_VIDEO_SOURCE_REVISION_STALE');
	});

	// Read after commit so a success receipt means canonical results were independently
	// visible, not merely accepted by the transaction or written to SeaweedFS.
	const [evidenceReadback] = await database.select({
		hash: evidence.hash,
		aiAnalysis: evidence.aiAnalysis,
	}).from(evidence).where(and(
		eq(evidence.id, input.evidenceId),
		eq(evidence.caseId, input.caseId),
		eq(evidence.hash, input.sourceRevision),
		isNull(evidence.deletedAt),
	)).limit(1);
	const aiAnalysis = evidenceReadback?.aiAnalysis as Record<string, unknown> | null | undefined;
	const videoAnalysis = aiAnalysis?.videoAnalysis as Record<string, unknown> | undefined;
	const storedFrames = Array.isArray(videoAnalysis?.frames) ? videoAnalysis.frames : [];
	const storedMotionSamples = Array.isArray(videoAnalysis?.motionSamples) ? videoAnalysis.motionSamples : [];
	const parsedStoredSkimPreview = videoSkimPreviewManifestV1Schema.safeParse(videoAnalysis?.skimPreview);
	const storedSkimPreview = parsedStoredSkimPreview.success ? parsedStoredSkimPreview.data : null;
	const parsedStoredEventTimeline = videoEventTimelineV1Schema.safeParse(videoAnalysis?.eventTimeline);
	const storedEventTimeline = parsedStoredEventTimeline.success ? parsedStoredEventTimeline.data : null;
	if (
		!videoAnalysis ||
		videoAnalysis.sourceRevision !== input.sourceRevision ||
		videoAnalysis.analysisRevision !== input.analysisRevision ||
		!storedEventTimeline ||
		storedEventTimeline.evidenceId !== input.evidenceId ||
		storedEventTimeline.caseId !== input.caseId ||
		storedEventTimeline.sourceRevision !== input.sourceRevision ||
		storedEventTimeline.analysisRevision !== input.analysisRevision ||
		stableStringify(storedEventTimeline) !== stableStringify(eventTimeline) ||
		videoAnalysis.skimPreviewStatus !== input.skimPreviewStatus ||
		storedFrames.length !== input.frames.length ||
		storedMotionSamples.length !== input.motionSamples.length ||
		stableStringify(storedMotionSamples) !== stableStringify(input.motionSamples) ||
		storedFrames.some((value, index) => {
			if (!value || typeof value !== 'object') return true;
			const frame = value as Record<string, unknown>;
			const expected = input.frames[index];
			return frame.sourceRevision !== input.sourceRevision || frame.analysisRevision !== input.analysisRevision ||
				frame.reviewState !== 'UNREVIEWED_PROPOSAL' || stableStringify(frame.motionLut ?? null) !== stableStringify(expected?.motionLut ?? null);
		})
	) {
		throw new Error('EVIDENCE_VIDEO_CANONICAL_READBACK_MISMATCH');
	}
	if (input.skimPreview && (
		!storedSkimPreview ||
		storedSkimPreview.sourceRevision !== input.sourceRevision ||
		storedSkimPreview.analysisRevision !== input.analysisRevision ||
		JSON.stringify(storedSkimPreview.sampleTimestampsMs) !== JSON.stringify(input.skimPreview.sampleTimestampsMs) ||
		storedSkimPreview.tiles.length !== input.skimPreview.tiles.length ||
		storedSkimPreview.tiles.some((tile, index) => {
			const expected = input.skimPreview?.tiles[index];
			return !expected || tile.index !== expected.index || tile.objectKey !== expected.objectKey ||
				tile.sha256 !== expected.sha256 || tile.byteLength !== expected.byteLength ||
				tile.firstSampleIndex !== expected.firstSampleIndex || tile.sampleCount !== expected.sampleCount;
		})
	)) throw new Error('EVIDENCE_VIDEO_SKIM_READBACK_MISMATCH');

	let transcriptRowCount = 0;
	let transcriptSegmentCount = 0;
	if (input.transcript) {
		const transcriptRows = await database.select({ metadata: audioTranscripts.metadata })
			.from(audioTranscripts)
			.where(and(
				eq(audioTranscripts.id, input.analysisJobId),
				eq(audioTranscripts.evidenceId, input.evidenceId),
				eq(audioTranscripts.caseId, input.caseId),
			))
			.limit(1);
		const transcriptMetadata = transcriptRows[0]?.metadata as Record<string, unknown> | null | undefined;
		if (
			!transcriptMetadata ||
			transcriptMetadata.sourceRevision !== input.sourceRevision ||
			transcriptMetadata.analysisRevision !== input.analysisRevision
		) {
			throw new Error('EVIDENCE_VIDEO_TRANSCRIPT_READBACK_MISMATCH');
		}
		transcriptRowCount = transcriptRows.length;

		const segments = await database.select({
			segmentIndex: whisperSegments.segmentIndex,
			startMs: whisperSegments.startMs,
			endMs: whisperSegments.endMs,
			text: whisperSegments.text,
			metadata: whisperSegments.metadata,
		}).from(whisperSegments).where(and(
			eq(whisperSegments.transcriptId, input.analysisJobId),
			eq(whisperSegments.evidenceId, input.evidenceId),
		));
		const expectedSegments = input.transcript.chunks;
		if (segments.length !== expectedSegments.length || segments.some((segment) => {
			const expected = expectedSegments[segment.segmentIndex];
			const metadata = segment.metadata as Record<string, unknown> | null | undefined;
			return !expected || segment.startMs !== expected.startMs || segment.endMs !== expected.endMs || segment.text !== expected.text ||
				metadata?.sourceRevision !== input.sourceRevision || metadata?.analysisRevision !== input.analysisRevision ||
				stableStringify(metadata?.words ?? null) !== stableStringify(expected.words ?? null);
		})) {
			throw new Error('EVIDENCE_VIDEO_TRANSCRIPT_SEGMENT_READBACK_MISMATCH');
		}
		transcriptSegmentCount = segments.length;
	}

	return {
		evidenceRowCount: 1,
		frameFindingCount: storedFrames.length,
		transcriptRowCount,
		transcriptSegmentCount,
		skimTileCount: input.skimPreview?.tiles.length ?? 0,
		skimSampleCount: input.skimPreview?.sampleTimestampsMs.length ?? 0,
	};
}

const defaultDependencies: VideoAnalysisDependenciesV1 = {
	database: db,
	ensureCaseOwned,
	modelDir: ENV.ATLAS_EMBEDDINGGEMMA2_ONNX_MODEL_DIR?.trim() || null,
	audioEmbeddingsEnabled: ENV.ATLAS_EMBEDDINGGEMMA2_AUDIO_SEGMENTS_ENABLED === true,
	probe: detectVideoAndAudioStreamsV1,
		extractFrames: async (bytes, options) => {
		const { VisionService } = await import('$lib/server/evidence/video/vision-service.js');
			return new VisionService().extractFrames(bytes, { fps: options.fps, maxFrames: options.maxFrames, scaleWidth: options.scaleWidth ?? 768 });
	},
	frameDimensions: async (buffer) => {
		const sharpModule = await import('sharp');
		const metadata = await sharpModule.default(buffer).metadata();
		if (!metadata.width || !metadata.height) throw new Error('VIDEO_FRAME_DIMENSIONS_UNAVAILABLE');
		return { width: metadata.width, height: metadata.height };
	},
	ocrFrame: async (buffer) => {
			const { extractTextFromImage } = await import('$lib/server/ocr/tesseract.js');
			return extractTextFromImage(buffer, 'frame.jpg');
		},
		embedFrame: async (buffer, modelDir) => embedEvidenceImageViaEg2WorkerV1({ buffer, modelDir }),
	embedAudio: async (pcm, sampleRate, modelDir) => embedEvidenceAudioViaEg2WorkerV1({ pcm, sampleRate, modelDir }),
	embedTranscript: async (text, modelDir) => embedEvidenceTextViaEg2WorkerV1({ text, kind: 'document', modelDir }),
	persistVector: persistEvidenceMultimodalVectorV1,
	extractAudio: extractAudioTrack,
	transcribe: transcribeVideoAudio,
	readArtifactFile: readFile,
	artifactFileSize: async (path) => (await stat(path)).size,
	uploadArtifact: async (bucket, objectKey, bytes, metadata) => {
		await uploadSeaweedFile(bucket, objectKey, bytes, metadata);
	},
	statArtifact: async (bucket, objectKey) => {
		const result = await statSeaweedObject(bucket, objectKey);
		return { size: result.size };
	},
	extractSkimPreview: extractVideoSkimPreviewV1,
	loadDetector: loadDetectorV1,
	persist: (input, database) => persistCanonicalVideoAnalysisV1(input, database),
};

export async function processCanonicalVideoAnalysisV1(
	input: CanonicalVideoAnalysisV1Input,
	dependencies: VideoAnalysisDependenciesV1 = defaultDependencies,
): Promise<CanonicalVideoAnalysisV1Receipt> {
	if (!input.evidenceId || !input.caseId || !input.analysisJobId || !Number.isInteger(input.uploadedBy) || input.uploadedBy <= 0) {
		throw new Error('EVIDENCE_VIDEO_JOB_IDENTITY_INVALID');
	}
	if (!/^sha256:[a-f0-9]{64}$/.test(input.sourceRevision)) throw new Error('EVIDENCE_VIDEO_SOURCE_REVISION_INVALID');
	if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_VIDEO_BYTES_V1) throw new Error('EVIDENCE_VIDEO_SOURCE_SIZE_INVALID');
	if (`sha256:${sha256(input.bytes)}` !== input.sourceRevision) throw new Error('EVIDENCE_VIDEO_SOURCE_SHA256_MISMATCH');
	const sourceSha256 = input.sourceRevision.slice('sha256:'.length);

	await dependencies.ensureCaseOwned(input.caseId, String(input.uploadedBy));
	const [currentSource] = await dependencies.database.select({ id: evidence.id })
		.from(evidence)
		.where(and(
			eq(evidence.id, input.evidenceId),
			eq(evidence.caseId, input.caseId),
			eq(evidence.hash, input.sourceRevision),
			isNull(evidence.deletedAt),
		))
		.limit(1);
	if (!currentSource) throw new Error('EVIDENCE_VIDEO_SOURCE_REVISION_STALE');

	// The faster-whisper worker only reads files staged under its allowed media root.
	const mediaDir = join(process.cwd(), 'temp', 'media');
	await mkdir(mediaDir, { recursive: true });
	const workDir = await mkdtemp(join(mediaDir, 'atlas-video-'));
	const sourcePath = join(workDir, `source-${input.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
	try {
		await writeFile(sourcePath, input.bytes, { flag: 'wx' });
		await input.onProgress?.('content_analysis');
		const probe = await dependencies.probe(sourcePath);
		if (!probe.hasVideoStream) throw new Error('VIDEO_STREAM_NOT_FOUND');

		let transcription: Awaited<ReturnType<typeof transcribeVideoAudio>> | null = null;
		let transcriptionStatus: 'COMPLETED' | 'SKIPPED_NO_AUDIO' | 'TRANSCRIPTION_BINARY_UNAVAILABLE' | 'FAILED' = 'SKIPPED_NO_AUDIO';
		let transcriptionError: string | undefined;
		let audioArtifact: VideoDerivedArtifactV1 | null = null;
		let audioBytes: Buffer | null = null;
		if (probe.hasAudioStream) {
			let audioPath: string;
			try {
				audioPath = await dependencies.extractAudio(sourcePath, workDir);
			} catch (error) {
				transcriptionStatus = 'FAILED';
				transcriptionError = (error instanceof Error ? error.message : String(error)).slice(0, 180);
			}
			if (transcriptionStatus !== 'FAILED') {
				const audioFileSize = await dependencies.artifactFileSize(audioPath!);
				if (!Number.isSafeInteger(audioFileSize) || audioFileSize <= 0 || audioFileSize > MAX_AUDIO_ARTIFACT_BYTES_V1) {
					throw new Error('VIDEO_AUDIO_ARTIFACT_SIZE_OUT_OF_BOUNDS');
				}
				audioBytes = Buffer.from(await dependencies.readArtifactFile(audioPath!));
				if (audioBytes.byteLength !== audioFileSize) throw new Error('VIDEO_AUDIO_ARTIFACT_SIZE_CHANGED');
				audioArtifact = await storeDerivedArtifactV1({
					job: input,
					kind: 'audio',
					bytes: audioBytes,
					contentType: 'audio/wav',
					upload: dependencies.uploadArtifact,
					stat: dependencies.statArtifact,
				});
				try {
					await input.onProgress?.('content_analysis');
					const decodedTranscript = await dependencies.transcribe(audioPath, input.analysisJobId);
					const sourceOffsetMs = Math.round((probe.audioStartTimeSeconds ?? 0) * 1000);
					transcription = {
						...decodedTranscript,
						chunks: decodedTranscript.chunks.map((chunk) => ({
							...chunk,
							startMs: chunk.startMs + sourceOffsetMs,
							endMs: chunk.endMs + sourceOffsetMs,
						})),
					};
					transcriptionStatus = 'COMPLETED';
				} catch (error) {
					const msg = error instanceof Error ? error.message : String(error);
					transcriptionStatus = msg.includes('TRANSCRIPTION_BINARY_UNAVAILABLE') ? 'TRANSCRIPTION_BINARY_UNAVAILABLE' : 'FAILED';
					transcriptionError = msg.slice(0, 180);
				}
			}
		}

		const samplingFps = computeVideoFrameSampleRateV1(probe.durationSeconds, MAX_FRAME_SAMPLES_V1);
		const extractedFrames = await dependencies.extractFrames(input.bytes, { fps: samplingFps, maxFrames: MAX_FRAME_SAMPLES_V1 });
		const motionSampleFps = computeVideoMotionSampleRateV1(probe.durationSeconds);
		let motionSampleStatus: 'COMPLETED' | 'FAILED' | 'UNAVAILABLE' = 'UNAVAILABLE';
		let motionSamples: Array<Omit<VideoMotionSampleManifestV1, 'analysisRevision' | 'artifact'> & {
			artifact: Omit<VideoMotionSampleManifestV1['artifact'], 'analysisRevision'>;
		}> = [];
		try {
			const extractedMotionFrames = await dependencies.extractFrames(input.bytes, {
				fps: motionSampleFps,
				maxFrames: MAX_MOTION_FRAME_SAMPLES_V1,
				scaleWidth: VIDEO_MOTION_LUT_WIDTH_V1,
			});
			if (extractedMotionFrames.length > 0) {
				const sharpModule = await import('sharp');
				let previous: { luma: Uint8Array; timestampMs: number } | null = null;
				for (let sampleIndex = 0; sampleIndex < extractedMotionFrames.length && sampleIndex < MAX_MOTION_FRAME_SAMPLES_V1; sampleIndex += 1) {
					const sampleFrame = extractedMotionFrames[sampleIndex]!;
					if (!Number.isSafeInteger(sampleFrame.timestampMs) || sampleFrame.timestampMs < 0 || (previous && sampleFrame.timestampMs <= previous.timestampMs)) {
						throw new Error('VIDEO_MOTION_SAMPLE_TIMESTAMPS_INVALID');
					}
					const luma = await sharpModule.default(sampleFrame.buffer, { failOn: 'error', limitInputPixels: 16_777_216 })
						.resize(VIDEO_MOTION_LUT_WIDTH_V1, VIDEO_MOTION_LUT_HEIGHT_V1, {
							fit: 'contain', position: 'centre', background: { r: 0, g: 0, b: 0, alpha: 1 }, kernel: 'lanczos3',
						})
						.greyscale().raw().toBuffer();
					const currentLuma = new Uint8Array(luma.buffer, luma.byteOffset, luma.byteLength);
					const encoded = encodeVideoMotionLutV1(previous?.luma ?? null, currentLuma);
					const artifact = await storeDerivedArtifactV1({
						job: input, kind: 'motion-sample', index: sampleIndex, bytes: Buffer.from(encoded.bytes),
						contentType: 'application/vnd.atlas.video-motion-lut-v1', width: VIDEO_MOTION_LUT_WIDTH_V1,
						height: VIDEO_MOTION_LUT_HEIGHT_V1, upload: dependencies.uploadArtifact, stat: dependencies.statArtifact,
					});
					motionSamples.push({
						schema: 'atlas.video-motion-sample.v1',
						processingRevision: VIDEO_MOTION_LUT_PROCESSING_REVISION_V1,
						evidenceId: input.evidenceId,
						sourceRevision: input.sourceRevision,
						sampleIndex,
						width: VIDEO_MOTION_LUT_WIDTH_V1,
						height: VIDEO_MOTION_LUT_HEIGHT_V1,
						bitDepth: 4,
						packing: 'row-major-even-pixel-low-nibble-first',
						reviewState: 'UNREVIEWED_PIXEL_CHANGE_CUE',
						previousTimestampMs: previous?.timestampMs ?? null,
						timestampMs: sampleFrame.timestampMs,
						motionScore: encoded.motionScore,
						artifact,
					});
					previous = { luma: Uint8Array.from(currentLuma), timestampMs: sampleFrame.timestampMs };
				}
				motionSampleStatus = 'COMPLETED';
			}
		} catch (error) {
			motionSamples = [];
			motionSampleStatus = 'FAILED';
			console.warn('[VideoAnalysis] separate motion sampling unavailable:', error instanceof Error ? error.message : String(error));
		}
		const skimPreviewAssets: VideoSkimPreviewTileV1[] = [];
		let skimPreviewTimesMs: number[] = [];
		let skimPreviewIntervalMs = 0;
		let skimPreviewStatus: 'COMPLETED' | 'FAILED' | 'UNAVAILABLE' = 'UNAVAILABLE';
		let skimPreviewError: string | undefined;
		if (dependencies.extractSkimPreview) {
			try {
				await input.onProgress?.('content_analysis');
				const extractedSkim = await dependencies.extractSkimPreview({
					videoPath: sourcePath,
					durationSeconds: probe.durationSeconds,
					onTile: async (tile) => {
						const digest = sha256(tile.bytes);
						const bucket = ENV.SEAWEED_ARTIFACTS_BUCKET || ARTIFACTS_BUCKET;
						assertArtifactBucket(bucket);
						const objectKey = `evidence/${input.caseId}/${input.evidenceId}/${sourceSha256}/skim-preview-v1/tile-${String(tile.index).padStart(4, '0')}-${digest}.jpg`;
						await dependencies.uploadArtifact(bucket, objectKey, tile.bytes, {
							'Content-Type': 'image/jpeg',
						'x-evidence-id': input.evidenceId,
						'x-case-id': input.caseId,
						'x-source-revision': input.sourceRevision,
						'x-artifact-sha256': `sha256:${digest}`,
						'x-processing-revision': VIDEO_SKIM_PREVIEW_PROCESSING_REVISION_V1,
					});
						const statResult = await dependencies.statArtifact(bucket, objectKey);
						if (statResult.size !== tile.bytes.byteLength) throw new Error('VIDEO_SKIM_TILE_READBACK_SIZE_MISMATCH');
						skimPreviewAssets.push(createVideoSkimPreviewTileV1({
							index: tile.index,
							bytes: tile.bytes,
							firstSampleIndex: tile.firstSampleIndex,
							sampleCount: tile.sampleTimestampsMs.length,
							objectKey,
						}));
					},
				});
				skimPreviewIntervalMs = extractedSkim.sampleIntervalMs;
				skimPreviewTimesMs = extractedSkim.sampleTimestampsMs;
				if (extractedSkim.tileCount !== skimPreviewAssets.length || skimPreviewAssets.length === 0) throw new Error('VIDEO_SKIM_TILE_COUNT_MISMATCH');
				skimPreviewStatus = 'COMPLETED';
			} catch (error) {
				skimPreviewStatus = 'FAILED';
				skimPreviewError = (error instanceof Error ? error.message : String(error)).slice(0, 180);
				skimPreviewAssets.length = 0;
				skimPreviewTimesMs = [];
			}
		}
		const detector = await dependencies.loadDetector();
		const frames: Array<Omit<VideoFrameProposalV1, 'sourceRevision' | 'analysisRevision'>> = [];
		let detectorStatus: 'COMPLETED' | 'UNAVAILABLE' | 'FAILED' = detector ? 'COMPLETED' : 'UNAVAILABLE';
		let detectorError: string | undefined;
		const ocrTotal = Math.min(extractedFrames.length, MAX_FRAME_SAMPLES_V1);
			const ocrStartedAt = Date.now();
			for (let frameIndex = 0; frameIndex < extractedFrames.length && frameIndex < MAX_FRAME_SAMPLES_V1; frameIndex += 1) {
			const frame = extractedFrames[frameIndex];
			const { width: resizedWidth, height: resizedHeight } = await dependencies.frameDimensions(frame.buffer);
			const objects: VideoFrameProposalV1['objects'] = [];
			if (detector) {
				try {
					const detection = await detector.analyze(frame.buffer, `${frameIndex}.jpg`);
					for (const object of detection.objects) {
						const bbox = toSourceBox(object.bbox, probe.width ?? resizedWidth, probe.height ?? resizedHeight, resizedWidth, resizedHeight);
						if (bbox && Number.isFinite(object.confidence) && object.confidence >= 0 && object.confidence <= 1) {
							objects.push({ label: object.class, confidence: object.confidence, bbox });
						}
					}
				} catch (error) {
					detectorStatus = 'FAILED';
					detectorError = (error instanceof Error ? error.message : String(error)).slice(0, 180);
				}
			}
			const artifact = await storeDerivedArtifactV1({
				job: input,
				kind: 'frame',
				index: frameIndex,
				bytes: frame.buffer,
				contentType: 'image/jpeg',
				width: resizedWidth,
				height: resizedHeight,
				upload: dependencies.uploadArtifact,
				stat: dependencies.statArtifact,
			});
			let ocr: VideoFrameOcrV1 | undefined;
				if (dependencies.ocrFrame) {
					try {
						const result = await dependencies.ocrFrame(frame.buffer);
						const text = result.text.trim().slice(0, MAX_FRAME_OCR_CHARS_V1);
						ocr = result.error
							? { engine: 'tesseract', status: 'FAILED', text: '', error: result.error.slice(0, 180) }
							: { engine: 'tesseract', status: text ? 'COMPLETED' : 'EMPTY', text };
					} catch (error) {
						ocr = { engine: 'tesseract', status: 'FAILED', text: '', error: (error instanceof Error ? error.message : String(error)).slice(0, 180) };
					}
				}
				await input.onFrameProgress?.(frameProgressV1('frame_ocr', frameIndex + 1, ocrTotal, ocrStartedAt));
				frames.push({
					ocr,
				frameIndex,
				timestampMs: frame.timestampMs,
				width: probe.width ?? resizedWidth,
				height: probe.height ?? resizedHeight,
				objects,
				modelRevision: detector?.modelRevision ?? null,
				artifact,
				reviewState: 'UNREVIEWED_PROPOSAL',
			});
		}

		const trackScopeId = `sha256:${sha256(Buffer.from(`${input.evidenceId}:${input.sourceRevision}:${input.analysisJobId}`))}`;
		const trackedFrames = linkVideoFrameTracksV1(frames, trackScopeId);
		const analysisRevision = `${VIDEO_ANALYSIS_REVISION_V1}:${sha256(Buffer.from(JSON.stringify({
			sourceRevision: input.sourceRevision,
			jobId: input.analysisJobId,
			frameCount: frames.length,
			motionSampleCount: motionSamples.length,
			motionSampleFps,
			motionSamplingPolicy: VIDEO_MOTION_SAMPLING_POLICY_V1,
			motionSampleStatus,
			skimProcessingRevision: VIDEO_SKIM_PREVIEW_PROCESSING_REVISION_V1,
			skimSampleCount: skimPreviewTimesMs.length,
			skimSampleIntervalMs: skimPreviewIntervalMs,
			samplingPolicy: VIDEO_FRAME_SAMPLING_POLICY_V1,
			samplingFps,
			modelRevision: detector?.modelRevision ?? 'unavailable',
			motionLutRevision: VIDEO_MOTION_LUT_PROCESSING_REVISION_V1,
			trackLinkerRevision: VIDEO_TRACK_LINKER_REVISION_V1,
			whisperModel: transcription ? ENV.WHISPER_MODEL || 'whisper' : null,
			embeddingModelArtifactSha256: dependencies.modelDir ? EMBEDDINGGEMMA2_ONNX_MODEL_ARTIFACT_SHA256_V1 : null,
			frameEmbeddingPolicy: 'ALL_SAMPLED_FRAMES_V1',
			audioEmbeddingLimit: MAX_VIDEO_AUDIO_EMBEDDINGS_V1,
			audioEmbeddingWindowSamples: EMBEDDINGGEMMA2_ONNX_AUDIO_MAX_SAMPLES_V1,
			audioEmbeddingSamplingPolicy: VIDEO_AUDIO_EMBEDDING_SAMPLING_POLICY_V1,
			audioEmbeddingPreprocessingRevision: EMBEDDINGGEMMA2_ONNX_AUDIO_PREPROCESSING_REVISION_V1,
			transcriptEmbeddingLimit: MAX_VIDEO_TRANSCRIPT_EMBEDDINGS_V1,
		})))}`;
		const revisionBoundFrames = trackedFrames.map((frame) => {
			return {
				...frame,
				trackScopeId,
				sourceRevision: input.sourceRevision,
				analysisRevision,
				artifact: { ...frame.artifact, analysisRevision },
			};
		});
		const revisionBoundMotionSamples: VideoMotionSampleManifestV1[] = motionSamples.map((sample) => ({
			...sample,
			analysisRevision,
			artifact: { ...sample.artifact, analysisRevision },
		}));
		const revisionBoundAudioArtifact = audioArtifact ? { ...audioArtifact, analysisRevision } : null;
		const skimPreview: VideoSkimPreviewManifestV1 | null = skimPreviewStatus === 'COMPLETED' ? {
			schema: VIDEO_SKIM_PREVIEW_SCHEMA_V1,
			status: 'COMPLETED',
			sourceRevision: input.sourceRevision,
			analysisRevision,
			processingRevision: VIDEO_SKIM_PREVIEW_PROCESSING_REVISION_V1,
			durationMs: Math.ceil(probe.durationSeconds * 1000),
			sampleIntervalMs: skimPreviewIntervalMs,
			coverage: 'FULL_DURATION_SAMPLED_NOT_EVERY_SOURCE_FRAME',
			sampleTimestampsMs: skimPreviewTimesMs,
			tileLayout: {
				frameWidth: VIDEO_SKIM_PREVIEW_FRAME_WIDTH_V1,
				frameHeight: VIDEO_SKIM_PREVIEW_FRAME_HEIGHT_V1,
				framesPerTile: VIDEO_SKIM_PREVIEW_TILE_FRAMES_V1,
				columns: VIDEO_SKIM_PREVIEW_TILE_COLUMNS_V1,
				rows: VIDEO_SKIM_PREVIEW_TILE_ROWS_V1,
				tileWidth: VIDEO_SKIM_PREVIEW_TILE_WIDTH_V1,
				tileHeight: VIDEO_SKIM_PREVIEW_TILE_HEIGHT_V1,
			},
			tiles: skimPreviewAssets,
		} : null;
		const modelDir = dependencies.modelDir?.trim();
		const hasEmbeddingContent = revisionBoundFrames.length > 0 || (transcription?.chunks.length ?? 0) > 0 || (dependencies.audioEmbeddingsEnabled && audioBytes !== null);
		let embeddedVectorCount = 0;
		let embeddingStatus: 'COMPLETED' | 'UNAVAILABLE' | 'SKIPPED_NO_CONTENT' = 'SKIPPED_NO_CONTENT';
		let embeddingError: string | undefined;
		let audioEmbeddingStatus: 'COMPLETED' | 'UNAVAILABLE' | 'SKIPPED_NO_AUDIO' | 'SKIPPED_FEATURE_DISABLED' = !probe.hasAudioStream
			? 'SKIPPED_NO_AUDIO'
			: !dependencies.audioEmbeddingsEnabled ? 'SKIPPED_FEATURE_DISABLED' : 'UNAVAILABLE';
		let audioEmbeddingError: string | undefined;
		let audioCoverage: VideoAudioEmbeddingCoverageV1 | undefined;
		if (modelDir && hasEmbeddingContent) {
			embeddingStatus = 'COMPLETED';
			await input.onProgress?.('canonical_indexing');
			const embeddingStartedAt = Date.now();
			for (const [embeddedIndex, frame] of revisionBoundFrames.entries()) {
					try {
						const frameSource = extractedFrames[frame.frameIndex];
						if (!frameSource) throw new Error('VIDEO_FRAME_EMBEDDING_SOURCE_UNAVAILABLE');
						const embedded = await dependencies.embedFrame(frameSource.buffer, modelDir);
						if (embedded.inputSha256 !== frame.artifact.sha256) throw new Error('VIDEO_FRAME_EMBEDDING_INPUT_REVISION_MISMATCH');
						await dependencies.persistVector(dependencies.database, {
							evidenceId: input.evidenceId,
							caseId: input.caseId,
							sourceRevision: input.sourceRevision,
							analysisRevision,
							modality: 'video_frame',
							sourceLocator: {
								kind: 'sampled_video_frame', frameIndex: frame.frameIndex, timestampMs: frame.timestampMs,
								streamTimeBase: probe.streams.find((stream) => stream.codecType === 'video')?.timeBase ?? null,
								sourceWidth: frame.width, sourceHeight: frame.height,
								artifactObjectKey: frame.artifact.objectKey, artifactSha256: frame.artifact.sha256,
							},
							embedding: embedded.embedding, model: embedded.model,
							modelArtifactSha256: embedded.modelArtifactSha256,
							preprocessingRevision: embedded.preprocessingRevision,
							inputSha256: embedded.inputSha256, outputSha256: embedded.outputSha256,
							metadata: { modelOutputReviewState: 'UNREVIEWED_PROPOSAL', detectorModelRevision: frame.modelRevision },
						});
						embeddedVectorCount += 1;
						await input.onFrameProgress?.(frameProgressV1('frame_embedding', embeddedIndex + 1, revisionBoundFrames.length, embeddingStartedAt));
					} catch (error) {
						embeddingStatus = 'UNAVAILABLE';
						embeddingError = (error instanceof Error ? error.message : String(error)).slice(0, 180);
						break;
					}
				}
			if (dependencies.audioEmbeddingsEnabled && audioBytes && revisionBoundAudioArtifact) {
				const audioWindowLedger = dependencies.audioWindowLedger ?? await loadAudioWindowLedgerOrUndefinedV1(dependencies.database);
				const windowSamples = EMBEDDINGGEMMA2_ONNX_AUDIO_MAX_SAMPLES_V1;
				const audioInfo = readPcm16MonoWavWindowV1(audioBytes, 0, EMBEDDINGGEMMA2_ONNX_AUDIO_MAX_SAMPLES_V1).info;
				const candidateCount = Math.ceil(audioInfo.sampleCount / windowSamples);
				const selectedWindowIndexes = selectEvenly(Array.from({ length: candidateCount }, (_, index) => index), MAX_VIDEO_AUDIO_EMBEDDINGS_V1);
				audioCoverage = {
					policy: VIDEO_AUDIO_EMBEDDING_SAMPLING_POLICY_V1,
					sourceDurationMs: Math.round(audioInfo.sampleCount * 1000 / EMBEDDINGGEMMA2_ONNX_AUDIO_SAMPLE_RATE_V1),
					candidateWindowCount: candidateCount,
					selectedWindowCount: selectedWindowIndexes.length,
					completedWindowCount: 0,
						failedWindowCount: 0,
						resumedWindowCount: 0,
						coveredMs: 0,
					};
					const ledgerKey = { evidenceId: input.evidenceId, sourceRevision: input.sourceRevision, analysisRevision };
					const alreadyCompleted = audioWindowLedger
						? await audioWindowLedger.completedWindowIndexes(ledgerKey)
						: new Set<number>();
					for (const windowIndex of selectedWindowIndexes) {
						const startSample = windowIndex * windowSamples;
						const windowSampleCount = Math.min(windowSamples, audioInfo.sampleCount - startSample);
						if (alreadyCompleted.has(windowIndex)) {
							// Resume: this window's vector was already persisted for this source and analysis revision.
							audioCoverage.completedWindowCount += 1;
							audioCoverage.resumedWindowCount += 1;
							audioCoverage.coveredMs += Math.round(windowSampleCount * 1000 / EMBEDDINGGEMMA2_ONNX_AUDIO_SAMPLE_RATE_V1);
							continue;
						}
						const { pcm } = readPcm16MonoWavWindowV1(audioBytes, startSample, windowSamples);
						let embedded;
						try {
							embedded = await dependencies.embedAudio(pcm, EMBEDDINGGEMMA2_ONNX_AUDIO_SAMPLE_RATE_V1, modelDir);
						} catch (error) {
							// One failed window must not discard the remaining independent windows; the
							// stage stays UNAVAILABLE (never COMPLETED) and coverage reports the failure.
							const message = (error instanceof Error ? error.message : String(error)).slice(0, 180);
							audioEmbeddingStatus = 'UNAVAILABLE';
							audioEmbeddingError ??= message;
							if (audioCoverage) audioCoverage.failedWindowCount += 1;
							await audioWindowLedger?.recordWindow({
								...ledgerKey, analysisJobId: input.analysisJobId, windowIndex, startSample,
								sampleCount: windowSampleCount, status: 'FAILED', error: message,
							});
							continue;
						}
					const startMs = Math.round((probe.audioStartTimeSeconds ?? 0) * 1000 + startSample * 1000 / EMBEDDINGGEMMA2_ONNX_AUDIO_SAMPLE_RATE_V1);
					const endMs = startMs + embedded.durationMs;
					const persistedWindow = await dependencies.persistVector(dependencies.database, {
						evidenceId: input.evidenceId,
						caseId: input.caseId,
						sourceRevision: input.sourceRevision,
						analysisRevision,
						modality: 'audio_segment',
						representationId: EVIDENCE_AUDIO_CONTENT_REPRESENTATION_V1,
						sourceLocator: {
							kind: 'sampled_audio_window', windowIndex, startSample, sampleCount: pcm.length,
							startMs, endMs, sampleRate: EMBEDDINGGEMMA2_ONNX_AUDIO_SAMPLE_RATE_V1,
							samplingPolicy: VIDEO_AUDIO_EMBEDDING_SAMPLING_POLICY_V1,
							audioArtifactObjectKey: revisionBoundAudioArtifact.objectKey,
							audioArtifactSha256: revisionBoundAudioArtifact.sha256,
						},
						embedding: embedded.embedding, model: embedded.model,
						modelArtifactSha256: embedded.modelArtifactSha256,
						preprocessingRevision: embedded.preprocessingRevision,
						inputSha256: embedded.inputSha256, outputSha256: embedded.outputSha256,
						metadata: { representationKind: 'audio_content_embedding', modelRevision: embedded.modelRevision },
					});
					await audioWindowLedger?.recordWindow({
						...ledgerKey, analysisJobId: input.analysisJobId, windowIndex, startSample,
						sampleCount: pcm.length, status: 'COMPLETED', vectorLocatorSha256: persistedWindow.sourceLocatorSha256,
					});
					embeddedVectorCount += 1;
					if (audioCoverage) {
						audioCoverage.completedWindowCount += 1;
						audioCoverage.coveredMs += Math.round(pcm.length * 1000 / EMBEDDINGGEMMA2_ONNX_AUDIO_SAMPLE_RATE_V1);
					}
				}
				if (!audioEmbeddingError) audioEmbeddingStatus = 'COMPLETED';
			}
			if (embeddingStatus !== 'UNAVAILABLE') {
				for (const chunk of selectEvenly(transcription?.chunks ?? [], MAX_VIDEO_TRANSCRIPT_EMBEDDINGS_V1)) {
					try {
						const embedded = await dependencies.embedTranscript(chunk.text, modelDir);
						await dependencies.persistVector(dependencies.database, {
							evidenceId: input.evidenceId,
							caseId: input.caseId,
							sourceRevision: input.sourceRevision,
							analysisRevision,
							modality: 'audio_segment',
							sourceLocator: {
								kind: 'transcript_segment', startMs: chunk.startMs, endMs: chunk.endMs,
								streamTimeBase: probe.streams.find((stream) => stream.codecType === 'audio')?.timeBase ?? null,
							},
							embedding: embedded.embedding, model: embedded.model,
							modelArtifactSha256: embedded.modelArtifactSha256,
							preprocessingRevision: embedded.preprocessingRevision,
							inputSha256: embedded.inputSha256, outputSha256: embedded.outputSha256,
							metadata: { modelOutputReviewState: 'UNREVIEWED_PROPOSAL', transcriptId: input.analysisJobId },
						});
						embeddedVectorCount += 1;
					} catch (error) {
						embeddingStatus = 'UNAVAILABLE';
						embeddingError = (error instanceof Error ? error.message : String(error)).slice(0, 180);
						break;
					}
				}
			}
		} else if (hasEmbeddingContent) {
			embeddingStatus = 'UNAVAILABLE';
		}
		const readback = await dependencies.persist({
			evidenceId: input.evidenceId,
			caseId: input.caseId,
			analysisJobId: input.analysisJobId,
			sourceRevision: input.sourceRevision,
			analysisRevision,
			samplingFps,
			probe,
			transcript: transcription,
			audioArtifact: revisionBoundAudioArtifact,
			frames: revisionBoundFrames,
			motionSamples: revisionBoundMotionSamples,
			motionSampleFps,
			motionSamplingPolicy: VIDEO_MOTION_SAMPLING_POLICY_V1,
			motionSampleStatus,
			skimPreview,
			skimPreviewStatus,
			...(skimPreviewError ? { skimPreviewError } : {}),
			transcriptionStatus,
			...(transcriptionError ? { transcriptionError } : {}),
			detectorStatus,
			...(detectorError ? { detectorError } : {}),
			embeddingStatus,
			...(embeddingError ? { embeddingError } : {}),
			audioEmbeddingStatus,
			...(audioEmbeddingError ? { audioEmbeddingError } : {}),
			embeddedVectorCount,
		}, dependencies.database);
		const expectedTranscriptSegmentCount = transcription?.chunks.length ?? 0;
		if (
			readback.evidenceRowCount !== 1 ||
			readback.frameFindingCount !== revisionBoundFrames.length ||
			readback.transcriptRowCount !== (transcription ? 1 : 0) ||
			readback.transcriptSegmentCount !== expectedTranscriptSegmentCount ||
			readback.skimTileCount !== (skimPreview?.tiles.length ?? 0) ||
			readback.skimSampleCount !== (skimPreview?.sampleTimestampsMs.length ?? 0)
		) {
			throw new Error('EVIDENCE_VIDEO_CANONICAL_READBACK_MISMATCH');
		}
		const canonicalRecordCount = readback.evidenceRowCount + readback.frameFindingCount + readback.transcriptRowCount + readback.transcriptSegmentCount + embeddedVectorCount;
		const canonicalReadback = { ...readback, vectorCount: embeddedVectorCount, canonicalRecordCount };

		return {
			canonicalReceiptVerified: true,
			chunkCount: embeddedVectorCount,
			persistedCount: embeddedVectorCount,
			sourceRevision: input.sourceRevision,
			analysisRevision,
			representationId: embeddedVectorCount > 0 ? 'video-analysis-v1+evidence_multimodal_semantic_768' : 'video-analysis-v1',
			canonicalStore: embeddedVectorCount > 0
				? 'postgresql.evidence+audio_transcripts+whisper_segments+evidence_multimodal_vectors+projection_outbox'
				: 'postgresql.evidence+audio_transcripts+whisper_segments',
			readback: canonicalReadback,
			analysis: {
				status: transcriptionStatus === 'FAILED' || transcriptionStatus === 'TRANSCRIPTION_BINARY_UNAVAILABLE' || detectorStatus !== 'COMPLETED' || embeddingStatus === 'UNAVAILABLE' || audioEmbeddingStatus === 'UNAVAILABLE' || skimPreviewStatus === 'FAILED' || motionSampleStatus === 'FAILED' ? 'PARTIAL' : 'COMPLETE',
				transcriptionStatus,
				transcriptSegmentCount: transcription?.chunks.length ?? 0,
				detectorStatus,
				frameCount: revisionBoundFrames.length,
				coverage: 'BOUNDED_SAMPLE_NOT_FULL_VIDEO_COVERAGE',
				skimPreviewStatus,
				skimPreviewSampleCount: skimPreview?.sampleTimestampsMs.length ?? 0,
				frameSamplingPolicy: VIDEO_FRAME_SAMPLING_POLICY_V1,
				frameSampleRateFps: samplingFps,
				motionSampleStatus,
				motionSampleCount: revisionBoundMotionSamples.length,
				motionSampleRateFps: motionSampleFps,
				embeddingStatus,
				...(embeddingError ? { embeddingError } : {}),
				audioEmbeddingStatus,
				...(audioEmbeddingError ? { audioEmbeddingError } : {}),
				embeddedVectorCount,
				substages: {
					probe: {
						status: 'COMPLETED',
						hasVideoStream: probe.hasVideoStream,
						hasAudioStream: probe.hasAudioStream,
					},
					keyframes: {
						status: revisionBoundFrames.length > 0 ? 'COMPLETED' : 'FAILED',
						count: revisionBoundFrames.length,
						bucket: 'atlas-artifacts',
					},
					yolo: {
						status: detectorStatus,
						...(detectorError ? { error: detectorError } : {}),
					},
					transcription: {
						status: transcriptionStatus,
						...(transcriptionError ? { error: transcriptionError } : {}),
					},
					audioEmbedding: {
						status: audioEmbeddingStatus,
						...(audioEmbeddingError ? { error: audioEmbeddingError } : {}),
						...(audioCoverage ? { coverage: audioCoverage } : {}),
					},
				},
			},
		};
	} finally {
		await rm(workDir, { recursive: true, force: true }).catch(() => {});
	}
}
