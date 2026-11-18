export const VIDEO_MOTION_CUE_SCHEMA_V1 = 'atlas.video-motion-cue.v1' as const;

/** A frame candidate paired with an already lineage-validated compact motion tile. */
export type VideoMotionCueCandidateV1 = {
	timestamp: number;
	frameIndex?: number;
	timestampMs?: number;
	sourceRevision?: string;
	analysisRevision?: string;
	motionLut?: {
		schema: string;
		timestampMs: number;
		motionScore: number;
	} | null;
};

export type VideoMotionSampleV1 = {
	schema: 'atlas.video-motion-sample.v1';
	timestampMs: number;
	analysisRevision: string;
	sourceRevision: string;
};

export type VideoMotionCueAnalysisFrameV1 = {
	timestamp: number;
	timestampMs?: number;
	frameIndex?: number;
	analysisRevision?: string;
	sourceRevision?: string;
};

/**
 * Resolve a pixel-change sample to an analyzed frame only when the timestamp,
 * source revision, and analysis run are identical. Motion-only samples often
 * have no corresponding analyzed frame; callers must not substitute a nearby
 * frame because that could attach annotation to the wrong source moment.
 */
export function findExactVideoMotionSampleFrameV1<T extends VideoMotionCueAnalysisFrameV1>(
	sample: VideoMotionSampleV1,
	frames: readonly T[],
): T | null {
	if (
		sample.schema !== 'atlas.video-motion-sample.v1' ||
		!Number.isSafeInteger(sample.timestampMs) || sample.timestampMs < 0 ||
		typeof sample.sourceRevision !== 'string' || sample.sourceRevision.length === 0 ||
		typeof sample.analysisRevision !== 'string' || sample.analysisRevision.length === 0
	) return null;

	return frames.find((frame) =>
		Number.isSafeInteger(frame.timestampMs) && frame.timestampMs === sample.timestampMs &&
		Number.isSafeInteger(frame.frameIndex) && (frame.frameIndex ?? -1) >= 0 &&
		Number.isFinite(frame.timestamp) && frame.timestamp >= 0 &&
		frame.sourceRevision === sample.sourceRevision &&
		frame.analysisRevision === sample.analysisRevision
	) ?? null;
}

/**
 * Pick the strongest sampled pixel-change cue for review. The score summarizes
 * grayscale frame difference; it is not an object-motion or event finding.
 */
export function selectStrongestVideoMotionCueV1<T extends VideoMotionCueCandidateV1>(
	frames: readonly T[],
	expectedSourceRevision: string | null | undefined,
): T | null {
	if (!expectedSourceRevision) return null;
	let selected: T | null = null;
	for (const frame of frames) {
		const tile = frame.motionLut;
		if (
			!tile || tile.schema !== 'atlas.video-motion-lut.v1' ||
			!Number.isFinite(frame.timestamp) || frame.timestamp < 0 ||
			!Number.isSafeInteger(frame.timestampMs) || frame.timestampMs !== tile.timestampMs ||
			frame.sourceRevision !== expectedSourceRevision ||
			typeof frame.analysisRevision !== 'string' || frame.analysisRevision.length === 0 ||
			!Number.isFinite(tile.motionScore) || tile.motionScore <= 0 || tile.motionScore > 1
		) continue;

		const currentScore = selected?.motionLut?.motionScore ?? -1;
		const frameIndex = frame.frameIndex ?? Number.MAX_SAFE_INTEGER;
		const selectedFrameIndex = selected?.frameIndex ?? Number.MAX_SAFE_INTEGER;
		if (
			!selected || tile.motionScore > currentScore ||
			(tile.motionScore === currentScore && (frameIndex < selectedFrameIndex ||
				(frameIndex === selectedFrameIndex && frame.timestamp < selected.timestamp)))
		) selected = frame;
	}
	return selected;
}
