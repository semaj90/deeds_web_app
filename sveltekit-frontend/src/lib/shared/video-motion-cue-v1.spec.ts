import { describe, expect, it } from 'vitest';
import {
	findExactVideoMotionSampleFrameV1,
	selectStrongestVideoMotionCueV1,
	type VideoMotionCueCandidateV1,
	type VideoMotionSampleV1,
} from './video-motion-cue-v1.js';

const sourceRevision = `sha256:${'a'.repeat(64)}`;

function candidate(frameIndex: number, timestampMs: number, motionScore: number, overrides: Partial<VideoMotionCueCandidateV1> = {}): VideoMotionCueCandidateV1 {
	return {
		frameIndex,
		timestamp: timestampMs / 1000,
		timestampMs,
		sourceRevision,
		analysisRevision: 'run-1',
		motionLut: { schema: 'atlas.video-motion-lut.v1', timestampMs, motionScore },
		...overrides,
	};
}

describe('selectStrongestVideoMotionCueV1', () => {
	it('selects the strongest current-source pixel-change cue with deterministic ties', () => {
		const laterTie = candidate(4, 2000, 0.7);
		const earliestTie = candidate(2, 1000, 0.7);
		expect(selectStrongestVideoMotionCueV1([laterTie, earliestTie, candidate(9, 3000, 0.4)], sourceRevision)).toBe(earliestTie);
	});

	it('ignores stale-source, mismatched-time, malformed and zero-difference cues', () => {
		const stale = candidate(3, 1500, 0.9, { sourceRevision: `sha256:${'b'.repeat(64)}` });
		const mismatchedTime = candidate(4, 2000, 0.8, { motionLut: { schema: 'atlas.video-motion-lut.v1', timestampMs: 1999, motionScore: 0.8 } });
		const invalidSchema = candidate(5, 2500, 0.95, { motionLut: { schema: 'unknown', timestampMs: 2500, motionScore: 0.95 } });
		expect(selectStrongestVideoMotionCueV1([
			stale,
			mismatchedTime,
			invalidSchema,
			candidate(6, 3000, 0),
		], sourceRevision)).toBeNull();
	});

	it('requires an exact source revision', () => {
		expect(selectStrongestVideoMotionCueV1([candidate(1, 500, 0.5)], null)).toBeNull();
	});
});

describe('findExactVideoMotionSampleFrameV1', () => {
	const sample: VideoMotionSampleV1 = {
		schema: 'atlas.video-motion-sample.v1',
		timestampMs: 2000,
		sourceRevision,
		analysisRevision: 'run-1',
	};
	const exactFrame = {
		timestamp: 2,
		timestampMs: 2000,
		frameIndex: 4,
		sourceRevision,
		analysisRevision: 'run-1',
	};

	it('returns only the frame at the same timestamp, source, and analysis run', () => {
		expect(findExactVideoMotionSampleFrameV1(sample, [
			{ ...exactFrame, frameIndex: 3, timestampMs: 1999 },
			exactFrame,
		])).toBe(exactFrame);
	});

	it('does not choose a nearby frame or cross source/run revisions', () => {
		expect(findExactVideoMotionSampleFrameV1(sample, [
			{ ...exactFrame, timestampMs: 2001 },
			{ ...exactFrame, sourceRevision: `sha256:${'b'.repeat(64)}` },
			{ ...exactFrame, analysisRevision: 'run-2' },
		])).toBeNull();
	});

	it('rejects incomplete frame references and invalid samples', () => {
		expect(findExactVideoMotionSampleFrameV1(sample, [{ ...exactFrame, frameIndex: undefined }])).toBeNull();
		expect(findExactVideoMotionSampleFrameV1({ ...sample, timestampMs: -1 }, [exactFrame])).toBeNull();
	});
});
