import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const mocks = vi.hoisted(() => ({
	artifactSizes: new Map<string, number>(),
	select: vi.fn(),
	ensureCaseOwned: vi.fn(),
	probe: vi.fn(),
	extractFrames: vi.fn(),
	frameDimensions: vi.fn(),
	extractAudio: vi.fn(),
	transcribe: vi.fn(),
	readArtifactFile: vi.fn(),
	artifactFileSize: vi.fn(),
	uploadArtifact: vi.fn(),
	statArtifact: vi.fn(),
	loadDetector: vi.fn(),
	persist: vi.fn(),
	embedFrame: vi.fn(),
	embedAudio: vi.fn(),
	embedTranscript: vi.fn(),
	persistVector: vi.fn(),
}));

vi.mock('$lib/server/db/client.js', () => ({ db: { select: mocks.select } }));
vi.mock('$lib/server/db/schema-postgres.js', () => ({
	audioTranscripts: {},
	evidence: { id: 'evidence.id', caseId: 'evidence.case_id', hash: 'evidence.hash', deletedAt: 'evidence.deleted_at', aiAnalysis: 'evidence.ai_analysis' },
	whisperSegments: {},
}));
vi.mock('../video-ingest-service.js', () => ({ ensureCaseOwned: mocks.ensureCaseOwned }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { WHISPER_MODEL: 'fixture-whisper', SEAWEED_ARTIFACTS_BUCKET: 'atlas-artifacts' } }));
vi.mock('../transcript-service.js', () => ({ extractAudioTrack: mocks.extractAudio, transcribeVideoAudio: mocks.transcribe }));
vi.mock('../storyboard-manifest-contract-v1.js', () => ({ detectVideoAndAudioStreamsV1: mocks.probe }));

import { computeVideoFrameSampleRateV1, processCanonicalVideoAnalysisV1 } from '../durable-video-analysis-v1.js';

const EVIDENCE_ID = 'b6cdd941-8d37-4b2f-97dc-80bd37d5b183';
const CASE_ID = '0b52c31f-ff93-4c6e-823a-b4e95fb5a050';
const JOB_ID = '6248eeb0-9b3c-48d8-8d98-4531c5fe10b8';

function sourceRevision(bytes: Buffer): string {
	return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function pcm16MonoWav(samples = 16_000): Buffer {
	const dataBytes = samples * 2;
	const wav = Buffer.alloc(44 + dataBytes);
	wav.write('RIFF', 0); wav.writeUInt32LE(36 + dataBytes, 4); wav.write('WAVE', 8);
	wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
	wav.writeUInt32LE(16_000, 24); wav.writeUInt32LE(32_000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
	wav.write('data', 36); wav.writeUInt32LE(dataBytes, 40);
	return wav;
}

function dependencies(overrides: Partial<Parameters<typeof processCanonicalVideoAnalysisV1>[1]> = {}) {
	return {
		database: { select: mocks.select } as never,
		ensureCaseOwned: mocks.ensureCaseOwned,
		probe: mocks.probe,
		extractFrames: mocks.extractFrames,
		frameDimensions: mocks.frameDimensions,
		extractAudio: mocks.extractAudio,
		transcribe: mocks.transcribe,
		readArtifactFile: mocks.readArtifactFile,
		artifactFileSize: mocks.artifactFileSize,
		uploadArtifact: mocks.uploadArtifact,
		statArtifact: mocks.statArtifact,
		loadDetector: mocks.loadDetector,
		persist: mocks.persist,
		modelDir: null,
		audioEmbeddingsEnabled: false,
		embedFrame: mocks.embedFrame,
		embedAudio: mocks.embedAudio,
		embedTranscript: mocks.embedTranscript,
		persistVector: mocks.persistVector,
		...overrides,
	} as NonNullable<Parameters<typeof processCanonicalVideoAnalysisV1>[1]>;
}

describe('durable video analysis worker stage', () => {
	it('records per-frame OCR text and keeps a failed OCR call non-fatal', async () => {
		const bytes = Buffer.from('ocr-fixture-video');
		const ocrFrame = vi.fn()
			.mockResolvedValueOnce({ text: '  NO PARKING  ' })
			.mockRejectedValueOnce(new Error('tesseract missing'));
		mocks.extractFrames.mockResolvedValue([
			{ timestampMs: 1000, buffer: Buffer.from('frame-a') },
			{ timestampMs: 2000, buffer: Buffer.from('frame-b') },
		]);

		const result = await processCanonicalVideoAnalysisV1({
			evidenceId: EVIDENCE_ID,
			caseId: CASE_ID,
			analysisJobId: JOB_ID,
			uploadedBy: 7,
			sourceRevision: sourceRevision(bytes),
			fileName: 'fixture-ocr.mp4',
			bytes,
		}, dependencies({ ocrFrame }));

		expect(result).toBeDefined();
		expect(ocrFrame).toHaveBeenCalledTimes(2);
		const frames = mocks.persist.mock.calls[0]?.[0]?.frames as Array<{ ocr?: { status: string; text: string; error?: string } }>;
		expect(frames[0]?.ocr).toMatchObject({ engine: 'tesseract', status: 'COMPLETED', text: 'NO PARKING' });
		expect(frames[1]?.ocr).toMatchObject({ engine: 'tesseract', status: 'FAILED', text: '', error: 'tesseract missing' });
	});

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.ensureCaseOwned.mockResolvedValue(undefined);
		mocks.select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [{ id: EVIDENCE_ID }] }) }) });
		mocks.probe.mockResolvedValue({
			hasVideoStream: true,
			hasAudioStream: false,
			videoCodec: 'h264',
			width: 1920,
			height: 1080,
			durationSeconds: 10,
			durationFilmcraftTicks: 2540160000000n,
			streams: [],
		});
		mocks.extractFrames.mockResolvedValue([{ timestampMs: 1250, buffer: Buffer.from('frame') }]);
		mocks.frameDimensions.mockResolvedValue({ width: 768, height: 432 });
		mocks.extractAudio.mockResolvedValue('audio.wav');
		mocks.transcribe.mockResolvedValue({ text: '', language: 'en', chunks: [] });
		mocks.readArtifactFile.mockResolvedValue(pcm16MonoWav());
		mocks.artifactFileSize.mockResolvedValue(pcm16MonoWav().byteLength);
		mocks.artifactSizes.clear();
		mocks.uploadArtifact.mockImplementation(async (bucket: string, key: string, bytes: Buffer) => {
			mocks.artifactSizes.set(`${bucket}/${key}`, bytes.byteLength);
		});
		mocks.statArtifact.mockImplementation(async (bucket: string, key: string) => ({ size: mocks.artifactSizes.get(`${bucket}/${key}`) ?? -1 }));
		mocks.loadDetector.mockResolvedValue(null);
		mocks.embedFrame.mockImplementation(async (buffer: Buffer) => ({
			embedding: [1, ...Array(767).fill(0)], model: 'fixture-eg2', modelArtifactSha256: `sha256:${'a'.repeat(64)}`,
			modelRevision: 'fixture', preprocessingRevision: 'fixture-image-recipe',
			inputSha256: `sha256:${createHash('sha256').update(buffer).digest('hex')}`,
			outputSha256: `sha256:${'b'.repeat(64)}`, width: 768, height: 432,
		}));
		mocks.embedTranscript.mockImplementation(async (text: string) => ({
			embedding: [1, ...Array(767).fill(0)], model: 'fixture-eg2', modelArtifactSha256: `sha256:${'a'.repeat(64)}`,
			modelRevision: 'fixture', preprocessingRevision: 'fixture-text-recipe',
			inputSha256: `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`,
			outputSha256: `sha256:${'b'.repeat(64)}`, tokenCount: 3,
		}));
		mocks.embedAudio.mockImplementation(async (pcm: Float32Array, sampleRate: number) => ({
			embedding: [1, ...Array(767).fill(0)], model: 'fixture-eg2', modelArtifactSha256: `sha256:${'a'.repeat(64)}`,
			modelRevision: 'fixture', preprocessingRevision: 'fixture-audio-recipe',
			inputSha256: `sha256:${createHash('sha256').update(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)).update(`f32le-mono:${sampleRate}\\n`, 'utf8').digest('hex')}`,
			outputSha256: `sha256:${'b'.repeat(64)}`, sampleRate, durationMs: Math.round(pcm.length * 1000 / sampleRate),
		}));
		mocks.persistVector.mockResolvedValue({ id: 'vector-id', qdrantPointId: 'point-id', outputSha256: `sha256:${'b'.repeat(64)}`, sourceLocatorSha256: 'locator-hash' });
	mocks.persist.mockImplementation(async (input: { frames: unknown[]; transcript: { chunks: unknown[] } | null; skimPreview?: { tiles: unknown[]; sampleTimestampsMs: unknown[] } | null }) => ({
		evidenceRowCount: 1,
		frameFindingCount: input.frames.length,
		transcriptRowCount: input.transcript ? 1 : 0,
		transcriptSegmentCount: input.transcript?.chunks.length ?? 0,
		skimTileCount: input.skimPreview?.tiles.length ?? 0,
		skimSampleCount: input.skimPreview?.sampleTimestampsMs.length ?? 0,
	}));
	});

	it('stores a source-bound full-duration skim manifest and requires tile/sample readback', async () => {
		const bytes = Buffer.from('fixture-skim-video');
		const tileBytes = Buffer.from('fixture-sprite-tile');
		const extractSkimPreview = vi.fn(async (input: { onTile(tile: { index: number; bytes: Buffer; sampleTimestampsMs: number[]; firstSampleIndex: number }): Promise<void> }) => {
			await input.onTile({ index: 0, bytes: tileBytes, sampleTimestampsMs: [0, 1000], firstSampleIndex: 0 });
			return { sampleIntervalMs: 1000, sampleTimestampsMs: [0, 1000], tileCount: 1 };
		});

		const result = await processCanonicalVideoAnalysisV1({
			evidenceId: EVIDENCE_ID,
			caseId: CASE_ID,
			analysisJobId: JOB_ID,
			uploadedBy: 7,
			sourceRevision: sourceRevision(bytes),
			fileName: 'fixture-skim.mp4',
			bytes,
		}, dependencies({ extractSkimPreview }));

		expect(extractSkimPreview).toHaveBeenCalledWith(expect.objectContaining({ durationSeconds: 10, videoPath: expect.any(String) }));
		expect(mocks.persist.mock.calls[0]?.[0]).toMatchObject({ skimPreviewStatus: 'COMPLETED' });
		expect(mocks.uploadArtifact).toHaveBeenCalledWith('atlas-artifacts', expect.stringContaining('/skim-preview-v1/tile-0000-'), tileBytes, expect.objectContaining({
			'Content-Type': 'image/jpeg',
			'x-source-revision': sourceRevision(bytes),
			'x-processing-revision': 'atlas.video-skim-preview.v1:ffmpeg-1fps-160x90-sprite100',
		}));
		expect(mocks.persist).toHaveBeenCalledWith(expect.objectContaining({
			skimPreviewStatus: 'COMPLETED',
			skimPreview: expect.objectContaining({
				schema: 'atlas.video-skim-preview.v1',
				sourceRevision: sourceRevision(bytes),
				sampleTimestampsMs: [0, 1000],
				tiles: [expect.objectContaining({ index: 0, firstSampleIndex: 0, sampleCount: 2, byteLength: tileBytes.byteLength })],
			}),
		}), expect.anything());
		expect(result).toMatchObject({
			canonicalReceiptVerified: true,
			readback: { skimTileCount: 1, skimSampleCount: 2 },
			analysis: { skimPreviewStatus: 'COMPLETED', skimPreviewSampleCount: 2 },
		});
	});

	it('stores compact revision-bound motion LUTs from adjacent sampled frames', async () => {
		const bytes = Buffer.from('fixture-motion-video');
		const blackFrame = await sharp({ create: { width: 64, height: 128, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
		const whiteFrame = await sharp({ create: { width: 64, height: 128, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer();
		mocks.extractFrames.mockResolvedValue([
			{ timestampMs: 1000, buffer: blackFrame },
			{ timestampMs: 2500, buffer: whiteFrame },
		]);

		const result = await processCanonicalVideoAnalysisV1({
			evidenceId: EVIDENCE_ID,
			caseId: CASE_ID,
			analysisJobId: JOB_ID,
			uploadedBy: 7,
			sourceRevision: sourceRevision(bytes),
			fileName: 'fixture-motion.mp4',
			bytes,
		}, dependencies());

		const frames = mocks.persist.mock.calls.at(-1)?.[0]?.frames as Array<{
			timestampMs: number;
			motionLut?: { frameIndex: number; timestampMs: number; previousTimestampMs: number | null; motionScore: number; analysisRevision: string; artifact: { byteLength: number; sha256: string; analysisRevision: string } };
		}>;
		expect(frames).toHaveLength(2);
		expect(frames[0]?.motionLut).toMatchObject({ frameIndex: 0, timestampMs: 1000, previousTimestampMs: null, motionScore: 0 });
		expect(frames[1]?.motionLut).toMatchObject({ frameIndex: 1, timestampMs: 2500, previousTimestampMs: 1000, motionScore: 1 });
		expect(frames[1]?.motionLut?.artifact).toMatchObject({
			byteLength: 4112,
			sha256: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
			analysisRevision: frames[1]?.motionLut?.analysisRevision,
		});
		expect(mocks.uploadArtifact).toHaveBeenCalledWith(
			'atlas-artifacts',
			expect.stringContaining(`/motion-0001.atm`),
			expect.any(Buffer),
			expect.objectContaining({ 'Content-Type': 'application/vnd.atlas.video-motion-lut-v1' }),
		);
		expect(result?.canonicalReceiptVerified).toBe(true);
	});

	it('persists source-scoped track hypotheses and timestamp-derived box motion', async () => {
		const bytes = Buffer.from('fixture-track-video');
		const frame = await sharp({ create: { width: 64, height: 128, channels: 3, background: { r: 24, g: 24, b: 24 } } }).png().toBuffer();
		mocks.extractFrames.mockResolvedValue([
			{ timestampMs: 1000, buffer: frame },
			{ timestampMs: 2000, buffer: frame },
		]);
		let detectionIndex = 0;
		const detector = {
			modelRevision: 'sha256:fixture-detector',
			analyze: async () => ({ objects: [{ class: 'person', confidence: 0.9, bbox: detectionIndex++ === 0 ? [10, 10, 30, 50] : [14, 10, 34, 50] }] }),
		};

		const result = await processCanonicalVideoAnalysisV1({
			evidenceId: EVIDENCE_ID, caseId: CASE_ID, analysisJobId: JOB_ID, uploadedBy: 7,
			sourceRevision: sourceRevision(bytes), fileName: 'fixture-track.mp4', bytes,
		}, dependencies({ loadDetector: async () => detector }));

		const frames = mocks.persist.mock.calls.at(-1)?.[0]?.frames as Array<{
			trackScopeId: string;
			objects: Array<{ trackId: string; centerPx: [number, number]; velocityPxPerSecond: [number, number] | null; trackState: string }>;
		}>;
		expect(frames.map((entry) => entry.objects[0]?.trackId)).toEqual(['track-0001', 'track-0001']);
		expect(frames[0]?.trackScopeId).toMatch(/^sha256:[a-f0-9]{64}$/);
		expect(frames[0]?.trackScopeId).toBe(frames[1]?.trackScopeId);
		expect(frames[0]?.objects[0]).toMatchObject({ velocityPxPerSecond: null, trackState: 'UNREVIEWED_TRACK_HYPOTHESIS' });
		expect(frames[1]?.objects[0]?.velocityPxPerSecond?.[0]).toBeGreaterThan(0);
		expect(result?.canonicalReceiptVerified).toBe(true);
	});

	it('fails closed when skim manifest readback misses tile or sample records', async () => {
		const bytes = Buffer.from('fixture-skim-readback-mismatch');
		const extractSkimPreview = vi.fn(async (input: { onTile(tile: { index: number; bytes: Buffer; sampleTimestampsMs: number[]; firstSampleIndex: number }): Promise<void> }) => {
			await input.onTile({ index: 0, bytes: Buffer.from('tile'), sampleTimestampsMs: [0, 1000], firstSampleIndex: 0 });
			return { sampleIntervalMs: 1000, sampleTimestampsMs: [0, 1000], tileCount: 1 };
		});
		mocks.persist.mockImplementationOnce(async (input: { frames: unknown[]; transcript: { chunks: unknown[] } | null }) => ({
			evidenceRowCount: 1,
			frameFindingCount: input.frames.length,
			transcriptRowCount: input.transcript ? 1 : 0,
			transcriptSegmentCount: input.transcript?.chunks.length ?? 0,
			skimTileCount: 0,
			skimSampleCount: 0,
		}));
		await expect(processCanonicalVideoAnalysisV1({
			evidenceId: EVIDENCE_ID, caseId: CASE_ID, analysisJobId: JOB_ID, uploadedBy: 7,
			sourceRevision: sourceRevision(bytes), fileName: 'fixture-skim.mp4', bytes,
		}, dependencies({ extractSkimPreview }))).rejects.toThrow('EVIDENCE_VIDEO_CANONICAL_READBACK_MISMATCH');
	});

	it('distributes the 60-frame budget over the full four-hour duration', async () => {
		const bytes = Buffer.from('fixture-four-hour-video');
		mocks.probe.mockResolvedValueOnce({
			hasVideoStream: true,
			hasAudioStream: false,
			videoCodec: 'h264',
			width: 1920,
			height: 1080,
			durationSeconds: 4 * 60 * 60,
			durationFilmcraftTicks: 4n * 60n * 60n * 254_016_000_000n,
			streams: [],
		});

		await processCanonicalVideoAnalysisV1({
			evidenceId: EVIDENCE_ID,
			caseId: CASE_ID,
			analysisJobId: JOB_ID,
			uploadedBy: 7,
			sourceRevision: sourceRevision(bytes),
			fileName: 'fixture-four-hour.mp4',
			bytes,
		}, dependencies());

		expect(computeVideoFrameSampleRateV1(4 * 60 * 60)).toBeCloseTo(1 / 240, 12);
		expect(mocks.extractFrames).toHaveBeenCalledWith(bytes, { fps: 1 / 240, maxFrames: 60 });
		expect(mocks.persist).toHaveBeenCalledWith(expect.objectContaining({ samplingFps: 1 / 240 }), expect.anything());
	});

	it('runs weight-free: no admitted detector records yolo UNAVAILABLE and keeps frame proposals', async () => {
		const bytes = Buffer.from('fixture-video-no-detector');
		const result = await processCanonicalVideoAnalysisV1({
			evidenceId: EVIDENCE_ID,
			caseId: CASE_ID,
			analysisJobId: JOB_ID,
			uploadedBy: 7,
			sourceRevision: sourceRevision(bytes),
			fileName: 'no-detector.mp4',
			bytes,
		}, dependencies());

		expect(mocks.loadDetector).toHaveBeenCalled();
		expect(mocks.persist).toHaveBeenCalledWith(expect.objectContaining({
			detectorStatus: 'UNAVAILABLE',
			frames: [expect.objectContaining({ reviewState: 'UNREVIEWED_PROPOSAL' })],
		}), expect.anything());
		expect(result).toMatchObject({
			canonicalReceiptVerified: true,
			readback: expect.objectContaining({ frameFindingCount: 1 }),
		});
	});

	it('skips audio work on silent video and persists only source-bound frame proposals', async () => {
		const bytes = Buffer.from('fixture-video');
		const result = await processCanonicalVideoAnalysisV1({
			evidenceId: EVIDENCE_ID,
			caseId: CASE_ID,
			analysisJobId: JOB_ID,
			uploadedBy: 7,
			sourceRevision: sourceRevision(bytes),
			fileName: 'fixture.mp4',
			bytes,
		}, dependencies());

		expect(mocks.extractAudio).not.toHaveBeenCalled();
		expect(mocks.transcribe).not.toHaveBeenCalled();
		expect(mocks.persist).toHaveBeenCalledWith(expect.objectContaining({
			transcriptionStatus: 'SKIPPED_NO_AUDIO',
			frames: [expect.objectContaining({
				timestampMs: 1250,
				width: 1920,
				height: 1080,
				reviewState: 'UNREVIEWED_PROPOSAL',
				artifact: expect.objectContaining({
					bucket: 'atlas-artifacts',
					objectKey: expect.stringContaining(`${EVIDENCE_ID}/${sourceRevision(bytes).slice(7)}/${JOB_ID}/frame-0000.jpg`),
					sha256: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
					width: 768,
					height: 432,
					sourceRevision: sourceRevision(bytes),
					analysisRevision: expect.stringContaining('video-analysis-v1:'),
				}),
			})],
		}), expect.anything());
		expect(mocks.uploadArtifact).toHaveBeenCalledWith('atlas-artifacts', expect.stringContaining('frame-0000.jpg'), Buffer.from('frame'), expect.objectContaining({
			'Content-Type': 'image/jpeg',
			'x-source-revision': sourceRevision(bytes),
			'x-image-width': '768',
			'x-image-height': '432',
		}));
		expect(mocks.statArtifact).toHaveBeenCalledWith('atlas-artifacts', expect.stringContaining('frame-0000.jpg'));
		expect(result).toMatchObject({
			canonicalReceiptVerified: true,
			chunkCount: 0,
			persistedCount: 0,
			sourceRevision: sourceRevision(bytes),
			readback: { evidenceRowCount: 1, frameFindingCount: 1, transcriptRowCount: 0, transcriptSegmentCount: 0, canonicalRecordCount: 2 },
		});
	});

	it('does not report canonical success when independent readback misses a frame finding', async () => {
		const bytes = Buffer.from('fixture-video-readback-mismatch');
		mocks.persist.mockResolvedValueOnce({
			evidenceRowCount: 1,
			frameFindingCount: 0,
			transcriptRowCount: 0,
			transcriptSegmentCount: 0,
		});

		await expect(processCanonicalVideoAnalysisV1({
			evidenceId: EVIDENCE_ID,
			caseId: CASE_ID,
			analysisJobId: JOB_ID,
			uploadedBy: 7,
			sourceRevision: sourceRevision(bytes),
			fileName: 'fixture.mp4',
			bytes,
		}, dependencies())).rejects.toThrow('EVIDENCE_VIDEO_CANONICAL_READBACK_MISMATCH');
	});

	it('embeds sampled frames and persists revision-bound vectors through the PostgreSQL projection outbox owner', async () => {
		const bytes = Buffer.from('fixture-video-with-eg2');
		const result = await processCanonicalVideoAnalysisV1({
			evidenceId: EVIDENCE_ID, caseId: CASE_ID, analysisJobId: JOB_ID, uploadedBy: 7,
			sourceRevision: sourceRevision(bytes), fileName: 'fixture.mp4', bytes,
		}, dependencies({ modelDir: 'fixture-model' }));

		expect(mocks.embedFrame).toHaveBeenCalledWith(Buffer.from('frame'), 'fixture-model');
		expect(mocks.persistVector).toHaveBeenCalledWith(expect.objectContaining({ select: mocks.select }), expect.objectContaining({
			evidenceId: EVIDENCE_ID,
			caseId: CASE_ID,
			sourceRevision: sourceRevision(bytes),
			modality: 'video_frame',
			sourceLocator: expect.objectContaining({ kind: 'sampled_video_frame', timestampMs: 1250, frameIndex: 0 }),
			metadata: expect.objectContaining({ modelOutputReviewState: 'UNREVIEWED_PROPOSAL' }),
		}));
		expect(result).toMatchObject({ chunkCount: 1, persistedCount: 1, readback: { vectorCount: 1 }, analysis: { embeddingStatus: 'COMPLETED', embeddedVectorCount: 1 } });
	});

	it('embeds timestamped transcript segments in the same canonical vector lane', async () => {
		const bytes = Buffer.from('fixture-video-with-transcript-vector');
		mocks.readArtifactFile.mockResolvedValue(pcm16MonoWav());
		mocks.artifactFileSize.mockResolvedValue(pcm16MonoWav().byteLength);
		mocks.probe.mockResolvedValueOnce({
			hasVideoStream: true, hasAudioStream: true, videoCodec: 'h264', width: 1920, height: 1080,
			durationSeconds: 10, durationFilmcraftTicks: 2540160000000n,
			streams: [{ codecType: 'audio', timeBase: '1/48000' }], audioStartTimeSeconds: 0.25,
		});
		mocks.transcribe.mockResolvedValueOnce({
			text: 'door closes', language: 'en',
			chunks: [{ startMs: 1000, endMs: 1500, text: 'door closes', language: 'en', confidence: 0.9, model: 'fixture-whisper' }],
		});

		const result = await processCanonicalVideoAnalysisV1({
			evidenceId: EVIDENCE_ID, caseId: CASE_ID, analysisJobId: JOB_ID, uploadedBy: 7,
			sourceRevision: sourceRevision(bytes), fileName: 'fixture.mp4', bytes,
		}, dependencies({ modelDir: 'fixture-model', audioEmbeddingsEnabled: true }));

		expect(mocks.embedTranscript).toHaveBeenCalledWith('door closes', 'fixture-model');
		expect(mocks.persistVector).toHaveBeenCalledWith(expect.objectContaining({ select: mocks.select }), expect.objectContaining({
			modality: 'audio_segment',
			sourceLocator: expect.objectContaining({ kind: 'transcript_segment', startMs: 1250, endMs: 1750, streamTimeBase: '1/48000' }),
			metadata: expect.objectContaining({ modelOutputReviewState: 'UNREVIEWED_PROPOSAL', transcriptId: JOB_ID }),
		}));
		expect(mocks.embedAudio).toHaveBeenCalledWith(expect.any(Float32Array), 16_000, 'fixture-model');
		expect(mocks.persistVector).toHaveBeenCalledWith(expect.objectContaining({ select: mocks.select }), expect.objectContaining({
			modality: 'audio_segment',
			sourceLocator: expect.objectContaining({ kind: 'sampled_audio_window', windowIndex: 0, startMs: 250, endMs: 1250, audioArtifactSha256: expect.any(String) }),
			metadata: expect.objectContaining({ representationKind: 'audio_content_embedding' }),
		}));
		expect(result).toMatchObject({ chunkCount: 3, persistedCount: 3, readback: { vectorCount: 3 }, analysis: { embeddingStatus: 'COMPLETED', embeddedVectorCount: 3 } });
	});

	it('keeps audio-embedding runtime failure visible without discarding other video results', async () => {
		const bytes = Buffer.from('fixture-video-audio-embedding-unavailable');
		mocks.probe.mockResolvedValueOnce({
			hasVideoStream: true, hasAudioStream: true, videoCodec: 'h264', width: 1920, height: 1080,
			durationSeconds: 10, durationFilmcraftTicks: 2540160000000n,
			streams: [{ codecType: 'audio', timeBase: '1/48000' }],
		});
		mocks.embedAudio.mockRejectedValueOnce(new Error('audio ONNX runtime unavailable'));
		const result = await processCanonicalVideoAnalysisV1({
			evidenceId: EVIDENCE_ID, caseId: CASE_ID, analysisJobId: JOB_ID, uploadedBy: 7,
			sourceRevision: sourceRevision(bytes), fileName: 'fixture.mp4', bytes,
		}, dependencies({ modelDir: 'fixture-model', audioEmbeddingsEnabled: true }));

		expect(mocks.persist).toHaveBeenCalledWith(expect.objectContaining({
			audioEmbeddingStatus: 'UNAVAILABLE', audioEmbeddingError: 'audio ONNX runtime unavailable',
		}), expect.anything());
		expect(result.analysis).toMatchObject({
			status: 'PARTIAL',
			audioEmbeddingStatus: 'UNAVAILABLE',
			substages: { audioEmbedding: { status: 'UNAVAILABLE', error: 'audio ONNX runtime unavailable' } },
		});
	});

	it('caps long-video audio embedding to eight non-overlapping timestamped windows', async () => {
		const bytes = Buffer.from('fixture-long-video-audio-embedding');
		const wav = pcm16MonoWav(16_000 * 60 * 5);
		mocks.readArtifactFile.mockResolvedValue(wav);
		mocks.artifactFileSize.mockResolvedValue(wav.byteLength);
		mocks.probe.mockResolvedValueOnce({
			hasVideoStream: true, hasAudioStream: true, videoCodec: 'h264', width: 1920, height: 1080,
			durationSeconds: 300, durationFilmcraftTicks: 76204800000000n,
			streams: [{ codecType: 'audio', timeBase: '1/48000' }], audioStartTimeSeconds: 0.25,
		});
		const result = await processCanonicalVideoAnalysisV1({
			evidenceId: EVIDENCE_ID, caseId: CASE_ID, analysisJobId: JOB_ID, uploadedBy: 7,
			sourceRevision: sourceRevision(bytes), fileName: 'long-fixture.mp4', bytes,
		}, dependencies({ modelDir: 'fixture-model', audioEmbeddingsEnabled: true }));

		expect(mocks.embedAudio).toHaveBeenCalledTimes(8);
		const audioLocators = mocks.persistVector.mock.calls
			.map(([, payload]) => payload as { modality?: string; sourceLocator?: { kind?: string; startSample?: number; sampleCount?: number; startMs?: number; samplingPolicy?: string } })
			.filter((payload) => payload.modality === 'audio_segment' && payload.sourceLocator?.kind === 'sampled_audio_window')
			.map((payload) => payload.sourceLocator!);
		expect(audioLocators).toHaveLength(8);
		expect(audioLocators[0]).toMatchObject({ startSample: 0, startMs: 250, samplingPolicy: 'pcm16-16khz-nonoverlap-even-windows-max-8x30s-v1' });
		expect(audioLocators.every((locator) => (locator.sampleCount ?? Infinity) <= 480_000)).toBe(true);
		expect(audioLocators.every((locator, index) => index === 0 || (locator.startSample ?? 0) - (audioLocators[index - 1].startSample ?? 0) >= 480_000)).toBe(true);
		expect(result.analysis.audioEmbeddingStatus).toBe('COMPLETED');
		// 5-minute source = 10 candidate 30 s windows; 8 are sampled. Coverage must say so explicitly.
		expect(result.analysis.substages.audioEmbedding.coverage).toEqual({
			policy: 'pcm16-16khz-nonoverlap-even-windows-max-8x30s-v1',
			sourceDurationMs: 300_000,
			candidateWindowCount: 10,
			selectedWindowCount: 8,
			completedWindowCount: 8,
			failedWindowCount: 0,
			resumedWindowCount: 0,
			coveredMs: 240_000,
		});
	});

	it('keeps independent audio windows when one window fails, and never reports the stage as COMPLETED', async () => {
		const bytes = Buffer.from('fixture-partial-audio-window-failure');
		const wav = pcm16MonoWav(16_000 * 60 * 5);
		mocks.readArtifactFile.mockResolvedValue(wav);
		mocks.artifactFileSize.mockResolvedValue(wav.byteLength);
		mocks.probe.mockResolvedValueOnce({
			hasVideoStream: true, hasAudioStream: true, videoCodec: 'h264', width: 1920, height: 1080,
			durationSeconds: 300, durationFilmcraftTicks: 76204800000000n,
			streams: [{ codecType: 'audio', timeBase: '1/48000' }], audioStartTimeSeconds: 0,
		});
		mocks.embedAudio.mockRejectedValueOnce(new Error('transient window failure'));
		const result = await processCanonicalVideoAnalysisV1({
			evidenceId: EVIDENCE_ID, caseId: CASE_ID, analysisJobId: JOB_ID, uploadedBy: 7,
			sourceRevision: sourceRevision(bytes), fileName: 'partial.mp4', bytes,
		}, dependencies({ modelDir: 'fixture-model', audioEmbeddingsEnabled: true }));

		expect(mocks.embedAudio).toHaveBeenCalledTimes(8);
		expect(result.analysis.audioEmbeddingStatus).toBe('UNAVAILABLE');
		expect(result.analysis.substages.audioEmbedding).toMatchObject({
			status: 'UNAVAILABLE',
			error: 'transient window failure',
			coverage: { selectedWindowCount: 8, completedWindowCount: 7, failedWindowCount: 1, coveredMs: 210_000 },
		});
	});

	it('resumes audio windows from a durable ledger and records each new outcome', async () => {
		const bytes = Buffer.from('fixture-audio-window-resume');
		const wav = pcm16MonoWav(16_000 * 60 * 5);
		mocks.readArtifactFile.mockResolvedValue(wav);
		mocks.artifactFileSize.mockResolvedValue(wav.byteLength);
		mocks.probe.mockResolvedValueOnce({
			hasVideoStream: true, hasAudioStream: true, videoCodec: 'h264', width: 1920, height: 1080,
			durationSeconds: 300, durationFilmcraftTicks: 76204800000000n,
			streams: [{ codecType: 'audio', timeBase: '1/48000' }], audioStartTimeSeconds: 0,
		});
		const ledger = {
			completedWindowIndexes: vi.fn(async () => new Set<number>([0, 1])),
			recordWindow: vi.fn(async () => undefined),
		};
		const result = await processCanonicalVideoAnalysisV1({
			evidenceId: EVIDENCE_ID, caseId: CASE_ID, analysisJobId: JOB_ID, uploadedBy: 7,
			sourceRevision: sourceRevision(bytes), fileName: 'resume.mp4', bytes,
		}, dependencies({ modelDir: 'fixture-model', audioEmbeddingsEnabled: true, audioWindowLedger: ledger }));

		// Windows 0 and 1 were persisted by an earlier attempt: only the other six are embedded again.
		expect(mocks.embedAudio).toHaveBeenCalledTimes(6);
		expect(ledger.recordWindow).toHaveBeenCalledTimes(6);
		expect(ledger.recordWindow.mock.calls.map(([record]) => record.windowIndex)).not.toContain(0);
		expect(ledger.recordWindow.mock.calls.every(([record]) => record.status === 'COMPLETED' && record.analysisJobId === JOB_ID)).toBe(true);
		expect(result.analysis.audioEmbeddingStatus).toBe('COMPLETED');
		expect(result.analysis.substages.audioEmbedding.coverage).toMatchObject({
			selectedWindowCount: 8, completedWindowCount: 8, resumedWindowCount: 2, failedWindowCount: 0, coveredMs: 240_000,
		});
	});

	it('skips audio-content embeddings while the feature gate is disabled', async () => {
		const bytes = Buffer.from('fixture-audio-embedding-disabled');
		const wav = pcm16MonoWav(16_000);
		mocks.readArtifactFile.mockResolvedValue(wav);
		mocks.artifactFileSize.mockResolvedValue(wav.byteLength);
		mocks.probe.mockResolvedValueOnce({
			hasVideoStream: true, hasAudioStream: true, videoCodec: 'h264', width: 1920, height: 1080,
			durationSeconds: 1, durationFilmcraftTicks: 254016000000n,
			streams: [{ codecType: 'audio', timeBase: '1/48000' }],
		});
		const result = await processCanonicalVideoAnalysisV1({
			evidenceId: EVIDENCE_ID, caseId: CASE_ID, analysisJobId: JOB_ID, uploadedBy: 7,
			sourceRevision: sourceRevision(bytes), fileName: 'fixture.mp4', bytes,
		}, dependencies({ modelDir: 'fixture-model', audioEmbeddingsEnabled: false }));

		expect(mocks.embedAudio).not.toHaveBeenCalled();
		expect(mocks.persistVector).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ sourceLocator: expect.objectContaining({ kind: 'sampled_audio_window' }) }));
		expect(result.analysis.audioEmbeddingStatus).toBe('SKIPPED_FEATURE_DISABLED');
	});

	it('uses actual extracted presentation timestamps and maps detector boxes to source pixels', async () => {
		const bytes = Buffer.from('fixture-av-video');
		mocks.probe.mockResolvedValueOnce({
			hasVideoStream: true,
			hasAudioStream: true,
			videoCodec: 'h264',
			width: 1920,
			height: 1080,
			durationSeconds: 10,
			durationFilmcraftTicks: 2540160000000n,
			streams: [],
		});
		mocks.loadDetector.mockResolvedValueOnce({
			modelRevision: 'sha256:detector',
			analyze: async () => ({ objects: [{ class: 'person', confidence: 0.91, bbox: [100, 50, 200, 150] }] }),
		});
		mocks.transcribe.mockResolvedValueOnce({
			text: 'hello',
			language: 'en',
			chunks: [{ startMs: 300, endMs: 900, text: 'hello', language: 'en', confidence: 0.8, model: 'fixture-whisper' }],
		});

		await processCanonicalVideoAnalysisV1({
			evidenceId: EVIDENCE_ID,
			caseId: CASE_ID,
			analysisJobId: JOB_ID,
			uploadedBy: 7,
			sourceRevision: sourceRevision(bytes),
			fileName: 'fixture.mp4',
			bytes,
		}, dependencies());

		expect(mocks.extractAudio).toHaveBeenCalledTimes(1);
		expect(mocks.persist).toHaveBeenCalledWith(expect.objectContaining({
			transcriptionStatus: 'COMPLETED',
			frames: [expect.objectContaining({ objects: [expect.objectContaining({ label: 'person', bbox: [250, 125, 500, 375] })] })],
			audioArtifact: expect.objectContaining({ bucket: 'atlas-artifacts', contentType: 'audio/wav', sourceRevision: sourceRevision(bytes), analysisRevision: expect.stringContaining('video-analysis-v1:') }),
		}), expect.anything());
		expect(mocks.uploadArtifact).toHaveBeenCalledTimes(2);
		expect(mocks.readArtifactFile).toHaveBeenCalledWith('audio.wav');
		expect(mocks.uploadArtifact).toHaveBeenCalledWith('atlas-artifacts', expect.stringContaining('/audio.wav'), pcm16MonoWav(), expect.objectContaining({
			'Content-Type': 'audio/wav',
			'x-source-revision': sourceRevision(bytes),
		}));
	});

	it('fails the job instead of claiming success when derived artifact upload fails', async () => {
		const bytes = Buffer.from('fixture-video');
		mocks.uploadArtifact.mockRejectedValueOnce(new Error('artifact store unavailable'));
		await expect(processCanonicalVideoAnalysisV1({
			evidenceId: EVIDENCE_ID,
			caseId: CASE_ID,
			analysisJobId: JOB_ID,
			uploadedBy: 7,
			sourceRevision: sourceRevision(bytes),
			fileName: 'fixture.mp4',
			bytes,
		}, dependencies())).rejects.toThrow('artifact store unavailable');
		expect(mocks.persist).not.toHaveBeenCalled();
	});

	it('rejects oversized extracted audio before buffering or uploading it', async () => {
		const bytes = Buffer.from('fixture-av-video');
		mocks.probe.mockResolvedValueOnce({ hasVideoStream: true, hasAudioStream: true, videoCodec: 'h264', width: 1920, height: 1080, durationSeconds: 10, durationFilmcraftTicks: 2540160000000n, streams: [] });
		mocks.artifactFileSize.mockResolvedValueOnce(512 * 1024 * 1024 + 1);
		await expect(processCanonicalVideoAnalysisV1({
			evidenceId: EVIDENCE_ID,
			caseId: CASE_ID,
			analysisJobId: JOB_ID,
			uploadedBy: 7,
			sourceRevision: sourceRevision(bytes),
			fileName: 'fixture.mp4',
			bytes,
		}, dependencies())).rejects.toThrow('VIDEO_AUDIO_ARTIFACT_SIZE_OUT_OF_BOUNDS');
		expect(mocks.readArtifactFile).not.toHaveBeenCalled();
		expect(mocks.uploadArtifact).not.toHaveBeenCalled();
		expect(mocks.persist).not.toHaveBeenCalled();
	});

	it('fails closed when artifact storage readback does not match uploaded bytes', async () => {
		const bytes = Buffer.from('fixture-video');
		mocks.statArtifact.mockResolvedValueOnce({ size: 999 });
		await expect(processCanonicalVideoAnalysisV1({
			evidenceId: EVIDENCE_ID,
			caseId: CASE_ID,
			analysisJobId: JOB_ID,
			uploadedBy: 7,
			sourceRevision: sourceRevision(bytes),
			fileName: 'fixture.mp4',
			bytes,
		}, dependencies())).rejects.toThrow('VIDEO_DERIVED_ARTIFACT_READBACK_SIZE_MISMATCH');
		expect(mocks.persist).not.toHaveBeenCalled();
	});

	it('rejects a stale source hash before probing or persisting', async () => {
		const bytes = Buffer.from('tampered-video');
		await expect(processCanonicalVideoAnalysisV1({
			evidenceId: EVIDENCE_ID,
			caseId: CASE_ID,
			analysisJobId: JOB_ID,
			uploadedBy: 7,
			sourceRevision: sourceRevision(Buffer.from('different-video')),
			fileName: 'fixture.mp4',
			bytes,
		}, dependencies())).rejects.toThrow('EVIDENCE_VIDEO_SOURCE_SHA256_MISMATCH');
		expect(mocks.probe).not.toHaveBeenCalled();
		expect(mocks.persist).not.toHaveBeenCalled();
	});

	it('rechecks the canonical evidence revision after authorization and before media work', async () => {
		const bytes = Buffer.from('fixture-video');
		mocks.select.mockReturnValueOnce({ from: () => ({ where: () => ({ limit: async () => [] }) }) });
		await expect(processCanonicalVideoAnalysisV1({
			evidenceId: EVIDENCE_ID,
			caseId: CASE_ID,
			analysisJobId: JOB_ID,
			uploadedBy: 7,
			sourceRevision: sourceRevision(bytes),
			fileName: 'fixture.mp4',
			bytes,
		}, dependencies())).rejects.toThrow('EVIDENCE_VIDEO_SOURCE_REVISION_STALE');
		expect(mocks.probe).not.toHaveBeenCalled();
		expect(mocks.extractFrames).not.toHaveBeenCalled();
	});
});
