import { describe, expect, it } from 'vitest';
import { humanCoco17PoseSchemaV1 } from './pose-skeleton-schema-v1.js';
import { derivePoseTrackMotionV1 } from './pose-track-motion-v1.js';

const evidenceId = '4cf3e0c4-f3c7-4e0a-9a7e-1adf01dd7291';
const sourceSha256 = `sha256:${'a'.repeat(64)}`;

function pose(frameIndex: number, framePtsUs: number, x: number, y: number, overrides: Record<string, unknown> = {}) {
	return {
		schema: 'atlas.pose-observation.v1',
		evidenceId,
		sourceSha256,
		sourceRevision: sourceSha256,
		analysisRevision: 'analysis-run-1',
		framePtsUs,
		frameIndex,
		frameWidth: 320,
		frameHeight: 180,
		skeletonSchemaId: humanCoco17PoseSchemaV1.schemaId,
		trackId: 'track-0001',
		trackScopeId: 'scope-1',
		origin: 'manual',
		modelRevision: null,
		reviewState: 'UNREVIEWED',
		keypoints: humanCoco17PoseSchemaV1.joints.map((joint) => ({
			index: joint.index,
			x: joint.index === 0 ? x : null,
			y: joint.index === 0 ? y : null,
			confidence: joint.index === 0 ? 1 : 0,
			visibility: joint.index === 0 ? 'visible' : 'not_labeled',
		})),
		...overrides,
	};
}

describe('derivePoseTrackMotionV1', () => {
	it('sorts source samples and derives per-joint pixel velocity in source time', () => {
		const result = derivePoseTrackMotionV1([
			pose(1, 1_500_000, 30, 16),
			pose(0, 1_000_000, 10, 20),
		]);

		expect(result.coordinateSpace).toBe('source_frame_pixels');
		expect(result).toMatchObject({
			status: 'UNREVIEWED_DERIVED_MEASUREMENT',
			measurementSemantics: 'source_frame_pixel_delta_includes_camera_motion',
			cameraMotionCompensated: false,
			worldCalibrated: false,
		});
		expect(result.samples.map((sample) => sample.frameIndex)).toEqual([0, 1]);
		expect(result.intervals[0]).toMatchObject({
			startPtsUs: 1_000_000,
			endPtsUs: 1_500_000,
			durationMs: 500,
			jointDeltas: [{ jointIndex: 0, fromPx: [10, 20], toPx: [30, 16], deltaPx: [20, -4], velocityPxPerSecond: [40, -8] }],
		});
	});

	it('keeps the full source/run/track identity in the result', () => {
		const result = derivePoseTrackMotionV1([pose(0, 1_000_000, 1, 1), pose(1, 2_000_000, 2, 3)]);
		expect(result).toMatchObject({
		evidenceId,
		sourceSha256,
		sourceRevision: sourceSha256,
		analysisRevision: 'analysis-run-1',
		trackScopeId: 'scope-1',
		trackId: 'track-0001',
		skeletonSchemaId: 'human.coco17.v1',
	});
	});

	it('rejects samples from different source revisions or track scopes', () => {
		expect(() => derivePoseTrackMotionV1([
			pose(0, 1_000_000, 1, 1),
			pose(1, 2_000_000, 2, 3, { sourceRevision: 'sha256:different' }),
		])).toThrow(/share evidence, source, analysis, track, schema/);
		expect(() => derivePoseTrackMotionV1([
			pose(0, 1_000_000, 1, 1),
			pose(1, 2_000_000, 2, 3, { trackScopeId: 'scope-2' }),
		])).toThrow(/share evidence, source, analysis, track, schema/);
	});

	it('rejects duplicate or reversed source frame order', () => {
		expect(() => derivePoseTrackMotionV1([pose(0, 1_000_000, 1, 1), pose(1, 1_000_000, 2, 3)])).toThrow(/strictly increasing/);
		expect(() => derivePoseTrackMotionV1([pose(2, 1_000_000, 1, 1), pose(1, 2_000_000, 2, 3)])).toThrow(/strictly increasing/);
	});

	it('requires at least two scoped track observations', () => {
		expect(() => derivePoseTrackMotionV1([pose(0, 1_000_000, 1, 1)])).toThrow(/at least two/);
		expect(() => derivePoseTrackMotionV1([pose(0, 1_000_000, 1, 1), pose(1, 2_000_000, 2, 3, { trackId: null, trackScopeId: null })])).toThrow(/scoped detector track/);
	});
});
