import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	evidence: { id: 'evidence.id' },
	evidenceItems: { id: 'evidence_items.id' },
	evidenceProcessingJobs: { id: 'evidence_processing_jobs.id' },
	dbInsert: vi.fn(),
	dbUpdate: vi.fn(),
	uploadFile: vi.fn(),
	probe: vi.fn(),
	extractAudioTrack: vi.fn(),
	transcribeVideoAudio: vi.fn(),
	summarizeVideoTranscript: vi.fn(),
	extractFrames: vi.fn(),
	createJob: vi.fn(),
	updateJob: vi.fn(),
	enqueueJob: vi.fn(),
}));

vi.mock('$lib/server/db/client.js', () => ({ db: { insert: mocks.dbInsert, update: mocks.dbUpdate } }));
vi.mock('$lib/server/db/schema/index.js', () => ({
	cases: { id: 'cases.id', userId: 'cases.user_id', assignedAttorney: 'cases.assigned_attorney' },
	evidence: mocks.evidence,
	evidenceItems: mocks.evidenceItems,
	evidenceProcessingJobs: mocks.evidenceProcessingJobs,
	evidenceFrames: { evidenceId: 'evidence_frames.evidence_id' },
	evidenceMediaAssets: { evidenceId: 'evidence_media_assets.evidence_id' },
	evidenceTranscriptSegments: { evidenceId: 'evidence_transcript_segments.evidence_id' },
}));
vi.mock('drizzle-orm', () => ({
	and: (...parts: unknown[]) => parts,
	eq: (left: unknown, right: unknown) => ({ left, right }),
	or: (...parts: unknown[]) => parts,
}));
vi.mock('$lib/server/seaweed-client.js', () => ({ uploadSeaweedFile: mocks.uploadFile }));
vi.mock('$lib/server/redis.js', () => ({ getRedis: () => null }));
vi.mock('$lib/server/evidence/services/embedding.js', () => ({ embedText: vi.fn() }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { SEAWEED_EVIDENCE_BUCKET: 'evidence', QDRANT_URL: 'http://qdrant.invalid' } }));
vi.mock('$lib/server/evidence-progress.js', () => ({ createJob: mocks.createJob, updateJob: mocks.updateJob }));
vi.mock('$lib/server/evidence-case-admission-v1.js', () => ({ requireOwnedEvidenceCaseV1: vi.fn() }));
vi.mock('$lib/server/analysis/analysis-jobs.js', () => ({ enqueueJob: mocks.enqueueJob }));
vi.mock('../transcript-service.js', () => ({
	downloadApprovedVideoSource: vi.fn(),
	extractAudioTrack: mocks.extractAudioTrack,
	transcribeVideoAudio: mocks.transcribeVideoAudio,
}));
vi.mock('../video-summary-service.js', () => ({ summarizeVideoTranscript: mocks.summarizeVideoTranscript }));
vi.mock('$lib/server/analysis/summarizer.js', () => ({ summarizeDocument: vi.fn() }));
vi.mock('../storyboard-manifest-contract-v1', () => ({ detectVideoAndAudioStreamsV1: mocks.probe }));
vi.mock('$lib/server/evidence/video/vision-service.js', () => ({
	VisionService: class {
		extractFrames = mocks.extractFrames;
	},
}));

import { admitVideoEvidenceV1, ingestVideoEvidence } from '../video-ingest-service.js';

const CASE_ID = '6d5b269d-8834-469a-a6cf-d5ce88731b09';

function makeUploadFile(name: string, bytes: string): File {
	const payload = Buffer.from(bytes);
	return {
		name,
		type: 'video/mp4',
		size: payload.byteLength,
		arrayBuffer: async () => payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength),
	} as File;
}

function makeDbChains() {
	const returning = vi.fn().mockResolvedValue([{ id: 'evidence-row', storageUri: 'seaweedfs://evidence/original' }]);
	const values = vi.fn().mockReturnValue({ returning });
	const insert = vi.fn().mockImplementation(() => ({ values }));
	const where = vi.fn().mockResolvedValue(undefined);
	const set = vi.fn().mockReturnValue({ where });
	const update = vi.fn().mockReturnValue({ set });
	mocks.dbInsert.mockImplementation(insert);
	mocks.dbUpdate.mockImplementation(update);
	return { insert, values, returning, update, set, where };
}

describe('video ingestion stream guard', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		makeDbChains();
		mocks.uploadFile.mockResolvedValue(undefined);
		mocks.probe.mockResolvedValue({ hasVideoStream: true, hasAudioStream: false });
		mocks.extractAudioTrack.mockRejectedValue(new Error('must not extract audio for silent media'));
		mocks.transcribeVideoAudio.mockRejectedValue(new Error('must not transcribe silent media'));
		mocks.summarizeVideoTranscript.mockResolvedValue({ summary: 'Transcript summary', keyFacts: [] });
		mocks.extractFrames.mockResolvedValue([]);
	});

	it('completes silent video without audio extraction or transcription', async () => {
		mocks.probe.mockResolvedValueOnce({ hasVideoStream: true, hasAudioStream: false });
		const result = await ingestVideoEvidence({
			caseId: CASE_ID,
			file: makeUploadFile('silent.mp4', 'synthetic silent video'),
		}, '12');

		expect(result.transcriptCount).toBe(0);
		expect(result.summary).toContain('Visual-only recording');
		expect(mocks.extractAudioTrack).not.toHaveBeenCalled();
		expect(mocks.transcribeVideoAudio).not.toHaveBeenCalled();
		expect(mocks.uploadFile).toHaveBeenCalledTimes(1);
		expect(mocks.dbUpdate).toHaveBeenCalledWith(mocks.evidenceItems);
	});

	it('defers transcript indexing instead of writing vectors directly to Qdrant', async () => {
		mocks.probe.mockResolvedValueOnce({ hasVideoStream: true, hasAudioStream: true });
		mocks.extractAudioTrack.mockImplementation(async (sourcePath: string) => sourcePath);
		mocks.transcribeVideoAudio.mockResolvedValueOnce({
			text: 'A person enters the room.',
			language: 'en',
			chunks: [{ startMs: 1000, endMs: 2400, text: 'A person enters the room.', confidence: 0.8, model: 'fixture-whisper' }],
		});
		const fetchSpy = vi.spyOn(globalThis, 'fetch');

		const result = await ingestVideoEvidence({
			caseId: CASE_ID,
			file: makeUploadFile('audio-video.mp4', 'fixture video bytes'),
		}, '12');

		expect(result.searchIndexStatus).toBe('deferred');
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(mocks.transcribeVideoAudio).toHaveBeenCalledTimes(1);
		fetchSpy.mockRestore();
	});

	it('fails closed when probing fails, retains the admitted original, and marks analysis failed', async () => {
		mocks.probe.mockRejectedValueOnce(new Error('ffprobe unavailable'));

		await expect(ingestVideoEvidence({
			caseId: CASE_ID,
			file: makeUploadFile('unknown.mp4', 'admitted source bytes'),
		}, '12')).rejects.toThrow('VIDEO_MEDIA_PROBE_FAILED');

		expect(mocks.uploadFile).toHaveBeenCalledTimes(1);
		expect(mocks.extractAudioTrack).not.toHaveBeenCalled();
		expect(mocks.transcribeVideoAudio).not.toHaveBeenCalled();
		expect(mocks.dbUpdate).toHaveBeenCalledWith(mocks.evidenceItems);
		expect(mocks.dbUpdate).toHaveBeenCalledWith(mocks.evidenceProcessingJobs);
	});

	it('admitVideoEvidenceV1 non-blocking admission inserts into public.evidence and enqueues upload_pipeline', async () => {
		mocks.enqueueJob.mockResolvedValueOnce('job-uuid-1234');

		const result = await admitVideoEvidenceV1({
			caseId: CASE_ID,
			file: makeUploadFile('traffic-cam.mp4', 'raw surveillance footage bytes'),
			title: 'Traffic Cam North',
		}, '12');

		expect(result.ok).toBe(true);
		expect(result.status).toBe('queued');
		expect(result.sourceRevision).toMatch(/^sha256:[a-f0-9]{64}$/);
		expect(mocks.uploadFile).toHaveBeenCalledTimes(1);
		expect(mocks.dbInsert).toHaveBeenCalledWith(mocks.evidence);
		expect(mocks.enqueueJob).toHaveBeenCalledWith(
			expect.objectContaining({
				jobType: 'upload_pipeline',
				caseId: CASE_ID,
				evidenceId: result.evidenceId,
				result: expect.objectContaining({
					sourceSha256: result.sourceRevision,
					fileName: 'traffic-cam.mp4',
					uploadedBy: 12,
				}),
			})
		);
	});
});
