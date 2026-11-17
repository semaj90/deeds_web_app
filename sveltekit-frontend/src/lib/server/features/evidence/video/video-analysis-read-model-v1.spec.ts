import { describe, expect, it } from 'vitest';
import { buildCanonicalVideoAnalysisReadModelV1, buildVideoAnalysisReadModelV1 } from './video-analysis-read-model-v1.js';

describe('buildVideoAnalysisReadModelV1', () => {
	const evidence = {
		id: 'video-1',
		status: 'completed',
		storageUri: 'seaweedfs://evidence/video-1.mp4',
		metadataJson: { title: 'Hearing', originalFileName: 'hearing.mp4', summary: 'A witness speaks.', summaryRevision: 'sha256:abc', keyFacts: ['witness'] },
		createdAt: '2026-01-01T00:00:00Z'
	};

	it('projects persisted transcript segments, summary and source frames to the analysis contract', () => {
		const model = buildVideoAnalysisReadModelV1({
			evidence,
			originalMimeType: 'video/mp4',
			transcript: [{ startMs: 1500, endMs: 2600, text: 'I saw the car.', language: 'en', confidence: '0.91', model: 'whisper' }],
			frames: [{ timestampMs: 1800, storageUri: 'seaweedfs://frames/1.jpg', caption: 'A car enters.', objectsJson: ['car'], tagsJson: ['vehicle'], confidence: '0.8' }]
		});

		expect(model.transcription).toEqual({ text: 'I saw the car.' });
		expect(model.transcriptSegments[0]).toMatchObject({ startMs: 1500, endMs: 2600, text: 'I saw the car.' });
		expect(model.transcriptSummary).toBe('A witness speaks.');
		expect(model.summaryRevision).toBe('sha256:abc');
		expect(model.frameAnalysis[0]).toMatchObject({ timestamp: 1.8, description: 'A car enters.', objects: ['car'] });
	});

	it('returns stable empty analysis fields for missing or malformed derived data', () => {
		const model = buildVideoAnalysisReadModelV1({
			evidence: { ...evidence, metadataJson: '{broken' },
			originalMimeType: null,
			transcript: [],
			frames: []
		});

		expect(model.transcription).toBeNull();
		expect(model.transcriptSummary).toBeNull();
		expect(model.frameAnalysis).toEqual([]);
		expect(model.sceneDetection).toEqual([]);
	});
});

describe('buildCanonicalVideoAnalysisReadModelV1', () => {
	it('adapts durable worker rows without leaking SeaweedFS object URIs', () => {
		const model = buildCanonicalVideoAnalysisReadModelV1({
			evidence: {
				id: 'evidence-1', title: 'Interview', fileName: 'interview.mp4', mimeType: 'video/mp4', fileSize: 100,
				status: 'completed', fileUrl: 'seaweedfs://evidence/original', createdAt: '2026-11-16T12:00:00.000Z',
				metadata: {}, hash: `sha256:${'a'.repeat(64)}`,
				aiAnalysis: {
					videoAnalysis: {
						schema: 'atlas.video-analysis.v1', sourceRevision: `sha256:${'a'.repeat(64)}`, analysisRevision: 'run-1',
						status: 'PARTIAL', transcriptionStatus: 'COMPLETED',
						probe: { durationSeconds: 5, width: 640, height: 360, frameRate: 30, videoCodec: 'h264' },
						frames: [{ timestampMs: 1200, sourceRevision: `sha256:${'a'.repeat(64)}`, analysisRevision: 'run-1', artifact: { storageUri: 'seaweedfs://evidence/frame-1' }, objects: [{ label: 'person', confidence: 0.9 }], reviewState: 'UNREVIEWED_PROPOSAL' }],
						eventTimeline: { sourceRevision: `sha256:${'a'.repeat(64)}`, analysisRevision: 'run-1', events: [{ startMs: 1000, endMs: 1500, summary: 'An unreviewed observation', sourceReferences: [{ kind: 'frame_detection' }] }] },
					},
				},
			},
			transcript: [{ startMs: 1100, endMs: 1400, text: 'hello', language: 'en', confidence: 0.8, model: 'faster-whisper:base:int8' }],
		});

		expect(model.transcriptSegments).toHaveLength(1);
		expect(model.frameAnalysis[0]).toMatchObject({ timestamp: 1.2, framePath: '/api/evidence/evidence-1/video-frame/0', objects: ['person'], tags: ['UNREVIEWED_PROPOSAL'], confidence: 0.9 });
		expect(model.sceneDetection[0]).toMatchObject({ startTime: 1, endTime: 1.5, reviewState: 'UNREVIEWED_PROPOSAL' });
		expect(model.videoMetadata).toMatchObject({ duration: 5, width: 640, height: 360, fps: 30, codec: 'h264' });
		expect(model.sourceRevision).toBe(`sha256:${'a'.repeat(64)}`);
	});
});
