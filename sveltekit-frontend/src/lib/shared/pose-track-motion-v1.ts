import {
	humanCoco17PoseSchemaV1,
	parsePoseObservationV1,
	type PoseObservationV1,
	type PoseSkeletonSchemaV1,
} from './pose-skeleton-schema-v1.js';

export const POSE_TRACK_MOTION_SCHEMA_V1 = 'atlas.pose-track-motion.v1' as const;

export type PoseTrackMotionV1 = {
	schema: typeof POSE_TRACK_MOTION_SCHEMA_V1;
	evidenceId: string;
	sourceSha256: string;
	sourceRevision: string;
	analysisRevision: string;
	trackScopeId: string;
	trackId: string;
	skeletonSchemaId: string;
	coordinateSpace: 'source_frame_pixels';
	status: 'UNREVIEWED_DERIVED_MEASUREMENT';
	measurementSemantics: 'source_frame_pixel_delta_includes_camera_motion';
	cameraMotionCompensated: false;
	worldCalibrated: false;
	samples: Array<{ frameIndex: number; framePtsUs: number; labeledJointCount: number }>;
	intervals: Array<{
		startFrameIndex: number;
		endFrameIndex: number;
		startPtsUs: number;
	endPtsUs: number;
		durationMs: number;
		jointDeltas: Array<{
			jointIndex: number;
			fromPx: [number, number];
			toPx: [number, number];
			deltaPx: [number, number];
			velocityPxPerSecond: [number, number];
		}>;
	}>;
};

/**
 * Derive adjacent source-image-plane pose deltas for one exact evidence/run track.
 * The result is a review aid in pixels, not calibrated world-space movement.
 */
export function derivePoseTrackMotionV1(
	inputs: readonly unknown[],
	schemaInput: unknown = humanCoco17PoseSchemaV1,
): PoseTrackMotionV1 {
	if (inputs.length < 2) throw new RangeError('Pose track motion requires at least two frame observations.');
	const schema = schemaInput as PoseSkeletonSchemaV1;
	const observations = inputs.map((input) => parsePoseObservationV1(input, schema));
	const first = observations[0]!;
	if (observations.some((observation) => !observation.trackId || !observation.trackScopeId)) {
		throw new RangeError('Pose track motion requires a scoped detector track hypothesis.');
	}
	for (const observation of observations) {
		if (
			observation.evidenceId !== first.evidenceId ||
			observation.sourceSha256 !== first.sourceSha256 ||
			observation.sourceRevision !== first.sourceRevision ||
			observation.analysisRevision !== first.analysisRevision ||
			observation.trackScopeId !== first.trackScopeId ||
			observation.trackId !== first.trackId ||
			observation.skeletonSchemaId !== first.skeletonSchemaId ||
			observation.frameWidth !== first.frameWidth ||
			observation.frameHeight !== first.frameHeight
		) {
			throw new RangeError('Pose track samples must share evidence, source, analysis, track, schema, and frame dimensions.');
		}
	}
	observations.sort((a, b) => a.framePtsUs - b.framePtsUs || a.frameIndex - b.frameIndex);
	for (let index = 1; index < observations.length; index += 1) {
		const previous = observations[index - 1]!;
		const current = observations[index]!;
		if (current.framePtsUs <= previous.framePtsUs || current.frameIndex <= previous.frameIndex) {
			throw new RangeError('Pose track samples require strictly increasing source timestamps and frame indexes.');
		}
	}

	const intervals = observations.slice(1).map((current, index) => {
		const previous = observations[index]!;
		const durationMs = (current.framePtsUs - previous.framePtsUs) / 1000;
		const durationSeconds = durationMs / 1000;
		const jointDeltas = previous.keypoints.flatMap((from, jointIndex) => {
			const to = current.keypoints[jointIndex]!;
			if (from.x === null || from.y === null || to.x === null || to.y === null) return [];
			const deltaX = to.x - from.x;
			const deltaY = to.y - from.y;
			return [{
				jointIndex,
				fromPx: [from.x, from.y] as [number, number],
				toPx: [to.x, to.y] as [number, number],
				deltaPx: [deltaX, deltaY] as [number, number],
				velocityPxPerSecond: [deltaX / durationSeconds, deltaY / durationSeconds] as [number, number],
			}];
		});
		return {
			startFrameIndex: previous.frameIndex,
			endFrameIndex: current.frameIndex,
			startPtsUs: previous.framePtsUs,
			endPtsUs: current.framePtsUs,
			durationMs,
			jointDeltas,
		};
	});

	return {
		schema: POSE_TRACK_MOTION_SCHEMA_V1,
		evidenceId: first.evidenceId,
		sourceSha256: first.sourceSha256,
		sourceRevision: first.sourceRevision,
		analysisRevision: first.analysisRevision,
		trackScopeId: first.trackScopeId,
		trackId: first.trackId,
		skeletonSchemaId: first.skeletonSchemaId,
		coordinateSpace: 'source_frame_pixels',
		status: 'UNREVIEWED_DERIVED_MEASUREMENT',
		measurementSemantics: 'source_frame_pixel_delta_includes_camera_motion',
		cameraMotionCompensated: false,
		worldCalibrated: false,
		samples: observations.map((observation) => ({
			frameIndex: observation.frameIndex,
			framePtsUs: observation.framePtsUs,
			labeledJointCount: observation.keypoints.filter((point) => point.x !== null && point.y !== null).length,
		})),
		intervals,
	};
}
