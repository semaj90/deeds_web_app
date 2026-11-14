import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';
import { audioTranscripts, evidence, whisperSegments } from '$lib/server/db/schema-postgres.js';
import { ensureCaseOwned } from './video-ingest-service.js';
import { ENV } from '$lib/server/env.server.js';
import { ARTIFACTS_BUCKET, assertArtifactBucket } from '$lib/server/storage/storage-buckets.js';
import { statSeaweedObject, uploadSeaweedFile } from '$lib/server/seaweed-client.js';
import { extractAudioTrack, transcribeVideoAudio } from './transcript-service.js';
import { detectVideoAndAudioStreamsV1 } from './storyboard-manifest-contract-v1.js';
import type { AnalysisJobProgressStageV1 } from '$lib/server/analysis/analysis-job-progress-events-v1.js';

const MAX_VIDEO_BYTES_V1 = 2 * 1024 * 1024 * 1024;
const MAX_FRAME_SAMPLES_V1 = 60;
const MAX_AUDIO_ARTIFACT_BYTES_V1 = 512 * 1024 * 1024;
const VIDEO_ANALYSIS_REVISION_V1 = 'video-analysis-v1';

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

export interface VideoFrameProposalV1 {
	frameIndex: number;
	timestampMs: number;
	width: number;
	height: number;
	objects: Array<{ label: string; confidence: number; bbox: [number, number, number, number] }>;
	modelRevision: string | null;
	artifact: VideoDerivedArtifactV1;
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
}

export interface CanonicalVideoAnalysisV1Receipt {
	canonicalReceiptVerified: true;
	chunkCount: 0;
	persistedCount: 0;
	sourceRevision: string;
	analysisRevision: string;
	representationId: 'video-analysis-v1';
	canonicalStore: 'postgresql.evidence+audio_transcripts+whisper_segments';
	analysis: {
		status: 'COMPLETE' | 'PARTIAL';
		transcriptionStatus: 'COMPLETED' | 'SKIPPED_NO_AUDIO' | 'FAILED';
		transcriptSegmentCount: number;
		detectorStatus: 'COMPLETED' | 'UNAVAILABLE' | 'FAILED';
		frameCount: number;
		coverage: 'BOUNDED_SAMPLE_NOT_FULL_VIDEO_COVERAGE';
	};
}

export interface VideoAnalysisDependenciesV1 {
	probe(path: string): ReturnType<typeof detectVideoAndAudioStreamsV1>;
	extractFrames(bytes: Buffer): Promise<Array<{ timestampMs: number; buffer: Buffer }>>;
	frameDimensions(buffer: Buffer): Promise<{ width: number; height: number }>;
	extractAudio(path: string, workDir: string): Promise<string>;
	transcribe(path: string, jobId: string): ReturnType<typeof transcribeVideoAudio>;
	readArtifactFile(path: string): Promise<Buffer>;
	artifactFileSize(path: string): Promise<number>;
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
		probe: Awaited<ReturnType<typeof detectVideoAndAudioStreamsV1>>;
		transcript: Awaited<ReturnType<typeof transcribeVideoAudio>> | null;
		audioArtifact: VideoDerivedArtifactV1 | null;
		frames: VideoFrameProposalV1[];
		transcriptionStatus: 'COMPLETED' | 'SKIPPED_NO_AUDIO' | 'FAILED';
		transcriptionError?: string;
		detectorStatus: 'COMPLETED' | 'UNAVAILABLE' | 'FAILED';
		detectorError?: string;
	}): Promise<void>;
}

function sha256(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex');
}

function derivedObjectKey(input: CanonicalVideoAnalysisV1Input, kind: 'audio' | 'frame', index?: number): string {
	const sourceHash = input.sourceRevision.slice('sha256:'.length);
	const name = kind === 'audio' ? 'audio.wav' : `frame-${String(index ?? 0).padStart(4, '0')}.jpg`;
	return `evidence/${input.caseId}/${input.evidenceId}/${sourceHash}/${input.analysisJobId}/${name}`;
}

async function storeDerivedArtifactV1(input: {
	job: CanonicalVideoAnalysisV1Input;
	kind: 'audio' | 'frame';
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

async function persistCanonicalVideoAnalysisV1(input: Parameters<VideoAnalysisDependenciesV1['persist']>[0]): Promise<void> {
	await db.transaction(async (tx) => {
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
					},
				})));
			}
		}

		const analysis = {
			schema: 'atlas.video-analysis.v1',
			analysisRevision: input.analysisRevision,
			analysisJobId: input.analysisJobId,
			sourceRevision: input.sourceRevision,
			status: input.transcriptionStatus === 'FAILED' || input.detectorStatus !== 'COMPLETED' ? 'PARTIAL' : 'COMPLETE',
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
				policy: 'ffmpeg-fps-1-pts-v1',
				maxFrames: MAX_FRAME_SAMPLES_V1,
				coverage: 'BOUNDED_SAMPLE_NOT_FULL_VIDEO_COVERAGE',
				sampledStartMs: input.frames[0]?.timestampMs ?? null,
				sampledEndMs: input.frames.at(-1)?.timestampMs ?? null,
			},
			transcriptionStatus: input.transcriptionStatus,
			audioArtifact: input.audioArtifact,
			...(input.transcriptionError ? { transcriptionError: input.transcriptionError } : {}),
			detectorStatus: input.detectorStatus,
			...(input.detectorError ? { detectorError: input.detectorError } : {}),
			frames: input.frames,
		};

		const updated = await tx.update(evidence).set({
			aiAnalysis: sql`COALESCE(${evidence.aiAnalysis}, '{}'::jsonb) || jsonb_build_object('videoAnalysis', ${JSON.stringify(analysis)}::jsonb)`,
		}).where(and(
			eq(evidence.id, input.evidenceId),
			eq(evidence.caseId, input.caseId),
			eq(evidence.hash, input.sourceRevision.slice('sha256:'.length)),
			isNull(evidence.deletedAt),
		)).returning({ id: evidence.id });
		if (!updated.length) throw new Error('EVIDENCE_VIDEO_SOURCE_REVISION_STALE');
	});
}

const defaultDependencies: VideoAnalysisDependenciesV1 = {
	probe: detectVideoAndAudioStreamsV1,
	extractFrames: async (bytes) => {
		const { VisionService } = await import('$lib/server/evidence/video/vision-service.js');
		return new VisionService().extractFrames(bytes, { fps: 1, maxFrames: MAX_FRAME_SAMPLES_V1, scaleWidth: 768 });
	},
	frameDimensions: async (buffer) => {
		const sharpModule = await import('sharp');
		const metadata = await sharpModule.default(buffer).metadata();
		if (!metadata.width || !metadata.height) throw new Error('VIDEO_FRAME_DIMENSIONS_UNAVAILABLE');
		return { width: metadata.width, height: metadata.height };
	},
	extractAudio: extractAudioTrack,
	transcribe: transcribeVideoAudio,
	readArtifactFile: readFile,
	artifactFileSize: async (path) => (await stat(path)).size,
	uploadArtifact: async (bucket, objectKey, bytes, metadata) => uploadSeaweedFile(bucket, objectKey, bytes, metadata),
	statArtifact: async (bucket, objectKey) => {
		const result = await statSeaweedObject(bucket, objectKey);
		return { size: result.size };
	},
	loadDetector: loadDetectorV1,
	persist: persistCanonicalVideoAnalysisV1,
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

	await ensureCaseOwned(input.caseId, String(input.uploadedBy));
	const [currentSource] = await db.select({ id: evidence.id })
		.from(evidence)
		.where(and(
			eq(evidence.id, input.evidenceId),
			eq(evidence.caseId, input.caseId),
			eq(evidence.hash, input.sourceRevision.slice('sha256:'.length)),
			isNull(evidence.deletedAt),
		))
		.limit(1);
	if (!currentSource) throw new Error('EVIDENCE_VIDEO_SOURCE_REVISION_STALE');

	const workDir = join(tmpdir(), `atlas-video-${input.analysisJobId}`);
	await mkdir(workDir, { recursive: true });
	const sourcePath = join(workDir, input.fileName.replace(/[^a-zA-Z0-9._-]/g, '_'));
	try {
		await writeFile(sourcePath, input.bytes, { flag: 'wx' }).catch(async (error: NodeJS.ErrnoException) => {
			if (error.code !== 'EEXIST') throw error;
			await rm(sourcePath, { force: true });
			await writeFile(sourcePath, input.bytes, { flag: 'wx' });
		});
		await input.onProgress?.('content_analysis');
		const probe = await dependencies.probe(sourcePath);
		if (!probe.hasVideoStream) throw new Error('VIDEO_STREAM_NOT_FOUND');

		let transcription: Awaited<ReturnType<typeof transcribeVideoAudio>> | null = null;
		let transcriptionStatus: 'COMPLETED' | 'SKIPPED_NO_AUDIO' | 'FAILED' = 'SKIPPED_NO_AUDIO';
		let transcriptionError: string | undefined;
		let audioArtifact: VideoDerivedArtifactV1 | null = null;
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
				const audioBytes = await dependencies.readArtifactFile(audioPath!);
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
					transcriptionStatus = 'FAILED';
					transcriptionError = (error instanceof Error ? error.message : String(error)).slice(0, 180);
				}
			}
		}

		const extractedFrames = await dependencies.extractFrames(input.bytes);
		const detector = await dependencies.loadDetector();
		const frames: Array<Omit<VideoFrameProposalV1, 'sourceRevision' | 'analysisRevision'>> = [];
		let detectorStatus: 'COMPLETED' | 'UNAVAILABLE' | 'FAILED' = detector ? 'COMPLETED' : 'UNAVAILABLE';
		let detectorError: string | undefined;
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
			frames.push({
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

		const analysisRevision = `${VIDEO_ANALYSIS_REVISION_V1}:${sha256(Buffer.from(JSON.stringify({
			sourceRevision: input.sourceRevision,
			jobId: input.analysisJobId,
			frameCount: frames.length,
			modelRevision: detector?.modelRevision ?? 'unavailable',
			whisperModel: transcription ? ENV.WHISPER_MODEL || 'whisper' : null,
		})))}`;
		const revisionBoundFrames = frames.map((frame) => ({
			...frame,
			sourceRevision: input.sourceRevision,
			analysisRevision,
			artifact: { ...frame.artifact, analysisRevision },
		}));
		const revisionBoundAudioArtifact = audioArtifact ? { ...audioArtifact, analysisRevision } : null;
		await dependencies.persist({
			evidenceId: input.evidenceId,
			caseId: input.caseId,
			analysisJobId: input.analysisJobId,
			sourceRevision: input.sourceRevision,
			analysisRevision,
			probe,
			transcript: transcription,
			audioArtifact: revisionBoundAudioArtifact,
			frames: revisionBoundFrames,
			transcriptionStatus,
			...(transcriptionError ? { transcriptionError } : {}),
			detectorStatus,
			...(detectorError ? { detectorError } : {}),
		});

		return {
			canonicalReceiptVerified: true,
			chunkCount: 0,
			persistedCount: 0,
			sourceRevision: input.sourceRevision,
			analysisRevision,
			representationId: 'video-analysis-v1',
			canonicalStore: 'postgresql.evidence+audio_transcripts+whisper_segments',
			analysis: {
				status: transcriptionStatus === 'FAILED' || detectorStatus !== 'COMPLETED' ? 'PARTIAL' : 'COMPLETE',
				transcriptionStatus,
				transcriptSegmentCount: transcription?.chunks.length ?? 0,
				detectorStatus,
				frameCount: revisionBoundFrames.length,
				coverage: 'BOUNDED_SAMPLE_NOT_FULL_VIDEO_COVERAGE',
			},
		};
	} finally {
		await rm(workDir, { recursive: true, force: true }).catch(() => {});
	}
}
