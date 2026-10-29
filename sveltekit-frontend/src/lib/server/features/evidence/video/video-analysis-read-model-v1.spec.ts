import { describe, expect, it } from 'vitest';
import { buildVideoAnalysisReadModelV1 } from './video-analysis-read-model-v1.js';

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
