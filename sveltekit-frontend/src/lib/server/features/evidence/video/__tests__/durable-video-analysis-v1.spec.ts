import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

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

import { processCanonicalVideoAnalysisV1 } from '../durable-video-analysis-v1.js';

const EVIDENCE_ID = 'b6cdd941-8d37-4b2f-97dc-80bd37d5b183';
const CASE_ID = '0b52c31f-ff93-4c6e-823a-b4e95fb5a050';
const JOB_ID = '6248eeb0-9b3c-48d8-8d98-4531c5fe10b8';

function sourceRevision(bytes: Buffer): string {
	return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function dependencies(overrides: Partial<Parameters<typeof processCanonicalVideoAnalysisV1>[1]> = {}) {
	return {
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
		...overrides,
	} as NonNullable<Parameters<typeof processCanonicalVideoAnalysisV1>[1]>;
}

describe('durable video analysis worker stage', () => {
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
		mocks.readArtifactFile.mockResolvedValue(Buffer.from('derived-audio'));
		mocks.artifactFileSize.mockResolvedValue(Buffer.byteLength('derived-audio'));
		mocks.artifactSizes.clear();
		mocks.uploadArtifact.mockImplementation(async (bucket: string, key: string, bytes: Buffer) => {
			mocks.artifactSizes.set(`${bucket}/${key}`, bytes.byteLength);
		});
		mocks.statArtifact.mockImplementation(async (bucket: string, key: string) => ({ size: mocks.artifactSizes.get(`${bucket}/${key}`) ?? -1 }));
		mocks.loadDetector.mockResolvedValue(null);
		mocks.persist.mockResolvedValue(undefined);
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
		}));
		expect(mocks.uploadArtifact).toHaveBeenCalledWith('atlas-artifacts', expect.stringContaining('frame-0000.jpg'), Buffer.from('frame'), expect.objectContaining({
			'Content-Type': 'image/jpeg',
			'x-source-revision': sourceRevision(bytes),
			'x-image-width': '768',
			'x-image-height': '432',
		}));
		expect(mocks.statArtifact).toHaveBeenCalledWith('atlas-artifacts', expect.stringContaining('frame-0000.jpg'));
		expect(result).toMatchObject({ canonicalReceiptVerified: true, chunkCount: 0, persistedCount: 0, sourceRevision: sourceRevision(bytes) });
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
		}));
		expect(mocks.uploadArtifact).toHaveBeenCalledTimes(2);
		expect(mocks.readArtifactFile).toHaveBeenCalledWith('audio.wav');
		expect(mocks.uploadArtifact).toHaveBeenCalledWith('atlas-artifacts', expect.stringContaining('/audio.wav'), Buffer.from('derived-audio'), expect.objectContaining({
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
