import { describe, expect, it } from 'vitest';
import { linkVideoFrameTracksV1 } from './video-track-linker-v1.js';
import { fuseVideoEventsV1, videoEventTimelineV1Schema } from './video-event-fusion-v1.js';

describe('video track linker v1', () => {
	it('links nearby same-class boxes and derives source-time pixel velocity', () => {
		const frames = linkVideoFrameTracksV1([
			{ frameIndex: 0, timestampMs: 1000, objects: [{ label: 'person', confidence: 0.9, bbox: [10, 10, 30, 50] }] },
			{ frameIndex: 1, timestampMs: 2000, objects: [{ label: 'person', confidence: 0.8, bbox: [14, 10, 34, 50] }] },
			{ frameIndex: 2, timestampMs: 3000, objects: [{ label: 'person', confidence: 0.85, bbox: [18, 10, 38, 50] }] },
		], 'sha256:source-and-run-scope');

		expect(frames[0]?.trackScopeId).toBe('sha256:source-and-run-scope');
		expect(frames.map((frame) => frame.objects[0]?.trackId)).toEqual(['track-0001', 'track-0001', 'track-0001']);
		expect(frames[0]?.objects[0]).toMatchObject({ centerPx: [20, 30], velocityPxPerSecond: null, trackState: 'UNREVIEWED_TRACK_HYPOTHESIS' });
		expect(frames[1]?.objects[0]?.velocityPxPerSecond).toEqual([4, 0]);
	});

	it('keeps concurrent same-class tracks one-to-one and separates class changes', () => {
		const frames = linkVideoFrameTracksV1([
			{ frameIndex: 0, timestampMs: 0, objects: [
				{ label: 'person', confidence: 0.7, bbox: [0, 0, 20, 40] },
				{ label: 'person', confidence: 0.8, bbox: [80, 0, 100, 40] },
			] },
			{ frameIndex: 1, timestampMs: 1000, objects: [
				{ label: 'person', confidence: 0.9, bbox: [84, 0, 104, 40] },
				{ label: 'dog', confidence: 0.9, bbox: [4, 0, 24, 40] },
			] },
		], 'scope');
		expect(frames[1]?.objects.map(({ label, trackId }) => [label, trackId])).toEqual([
			['dog', 'track-0003'], ['person', 'track-0002'],
		]);
	});

	it('rejects malformed time order, boxes and scope', () => {
		expect(() => linkVideoFrameTracksV1([], '', {})).toThrow(/configuration/);
		expect(() => linkVideoFrameTracksV1([
			{ frameIndex: 1, timestampMs: 10, objects: [] },
			{ frameIndex: 0, timestampMs: 11, objects: [] },
		], 'scope')).toThrow(/increasing indexes/);
		expect(() => linkVideoFrameTracksV1([
			{ frameIndex: 0, timestampMs: 10, objects: [{ label: 'person', confidence: 0.8, bbox: [1, 1, 1, 3] }] },
		], 'scope')).toThrow(/detection geometry/);
	});

	it('allows revision-scoped track metadata through source-cited event fusion', () => {
		const sourceRevision = `sha256:${'a'.repeat(64)}`;
		const analysisRevision = 'video-analysis-v1:fixture';
		const [frame] = linkVideoFrameTracksV1([
			{ frameIndex: 0, timestampMs: 1200, width: 1280, height: 720, modelRevision: 'sha256:detector', artifact: { sha256: `sha256:${'b'.repeat(64)}` }, sourceRevision, analysisRevision,
				objects: [{ label: 'person', confidence: 0.91, bbox: [10, 12, 40, 70] }] },
		], 'sha256:clip-run-scope');
		const timeline = fuseVideoEventsV1({
			evidenceId: 'b6cdd941-8d37-4b2f-97dc-80bd37d5b183',
			caseId: '0b52c31f-ff93-4c6e-823a-b4e95fb5a050',
			transcriptId: '6248eeb0-9b3c-48d8-8d98-4531c5fe10b8',
			sourceRevision,
			analysisRevision,
			frames: [frame],
			transcriptSegments: [],
		});
		expect(videoEventTimelineV1Schema.safeParse(timeline).success).toBe(true);
		expect(timeline.events[0]?.sourceReferences[0]).toMatchObject({ kind: 'frame_detection', frameIndex: 0, label: 'person' });
	});
});
