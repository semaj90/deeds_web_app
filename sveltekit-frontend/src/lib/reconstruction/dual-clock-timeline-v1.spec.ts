import { describe, expect, it, vi } from 'vitest';
import {
	DualClockMixerControllerV1,
	TIMELINE_TRACK_KINDS_V1,
	getActiveTrackItemsAtTimeV1,
	type AnimationMixerLikeV1,
	type TimelineTrackItemV1
} from './dual-clock-timeline-v1.js';

describe('DualClockMixerControllerV1 (ENG-03)', () => {
	it('enforces strict dual-clock separation (never calls update and setTime in the same frame)', () => {
		const mixer: AnimationMixerLikeV1 = {
			update: vi.fn(),
			setTime: vi.fn()
		};
		const controller = new DualClockMixerControllerV1(20);

		// Deterministic review mode -> setTime only
		controller.setMode('deterministic_review');
		const r1 = controller.stepFrame(mixer, { targetTimelineSeconds: 4.5, deltaSeconds: 0.016 });
		expect(r1.methodInvoked).toBe('setTime');
		expect(mixer.setTime).toHaveBeenCalledTimes(1);
		expect(mixer.setTime).toHaveBeenCalledWith(4.5);
		expect(mixer.update).not.toHaveBeenCalled();

		// Interactive preview mode -> update only
		controller.setMode('interactive_preview');
		const r2 = controller.stepFrame(mixer, { targetTimelineSeconds: 9.0, deltaSeconds: 0.016 });
		expect(r2.methodInvoked).toBe('update');
		expect(mixer.update).toHaveBeenCalledTimes(1);
		expect(mixer.update).toHaveBeenCalledWith(0.016);
		expect(mixer.setTime).toHaveBeenCalledTimes(1);
	});

	it('exposes all 5 horizontal tracks and evaluates active cues at scrubbed time', () => {
		expect(TIMELINE_TRACK_KINDS_V1).toEqual([
			'TransformTrack',
			'SkeletalTrack',
			'MorphTrack',
			'EvidenceTrack',
			'EventTrack'
		]);

		const items: TimelineTrackItemV1[] = [
			{
				id: 'tr-1',
				track: 'TransformTrack',
				label: 'Actor Path',
				startSeconds: 0,
				endSeconds: 8
			},
			{
				id: 'sk-1',
				track: 'SkeletalTrack',
				label: 'Walk',
				startSeconds: 1,
				endSeconds: 6,
				skeletalState: 'Walk'
			},
			{
				id: 'mo-1',
				track: 'MorphTrack',
				label: 'Blink',
				startSeconds: 2,
				endSeconds: 2.4
			},
			{
				id: 'ev-1',
				track: 'EvidenceTrack',
				label: 'Frame #48',
				startSeconds: 1.5,
				endSeconds: 4.0,
				videoPtsMs: 2000,
				frameIndex: 48
			},
			{
				id: 'cue-1',
				track: 'EventTrack',
				label: 'Camera Cue A',
				startSeconds: 3,
				endSeconds: 5
			}
		];

		const activeAt2s = getActiveTrackItemsAtTimeV1(items, 2.0);
		expect(activeAt2s.map((i) => i.id)).toEqual(['tr-1', 'sk-1', 'mo-1', 'ev-1']);
	});
});
