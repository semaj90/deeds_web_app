// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
	computeObservationId,
	SCENE_OBSERVATION_MANIFEST_SCHEMA_V1,
	SceneObservationManifestSchemaV1,
	type SceneObservationManifestV1,
} from './scene-observation-manifest-v1.js';

const CASE_ID = '3ac1c56f-8812-4f3b-9a10-20261106a1b2';
const EVIDENCE_ID = '0f067235-4957-4783-82a5-ad93bd71daab';
const ANALYSIS_JOB_ID = '4b31a594-72b7-4d08-9a3d-ed8385d7d928';
const SHA256_HEX = 'f2c64f35ea2b85f8af703988ba16291c38075995c8cbf6150502cd838a04bf03';
const REVISION = `sha256:${SHA256_HEX}`;

function createFixtureManifest(overrides: Partial<SceneObservationManifestV1> = {}): SceneObservationManifestV1 {
	return {
		schemaVersion: SCENE_OBSERVATION_MANIFEST_SCHEMA_V1,
		manifestId: 'manifest-001',
		caseId: CASE_ID,
		evidenceId: EVIDENCE_ID,
		sourceSha256: SHA256_HEX,
		sourceRevision: REVISION,
		analysisJobId: ANALYSIS_JOB_ID,
		analysisRevision: 'analysis-rev-1',
		createdAt: '2026-11-19T09:30:00.000Z',
		coverage: {
			keyframeSampling: {
				status: 'COMPLETED',
				sampledCount: 60,
				omittedCount: 0,
				samplingRateFps: 1,
			},
			objectDetection: {
				status: 'COMPLETED',
				modelRevision: 'yolov10n-coco-v1',
				detectedCount: 6,
				confidenceThreshold: 0.3,
			},
			segmentation: {
				status: 'COMPLETED',
				modelRevision: 'sam2-base-v1',
				maskCount: 4,
			},
			relativeDepth: {
				status: 'COMPLETED',
				modelRevision: 'depth-anything-v2-relative',
				depthMapCount: 60,
				isMonocularEstimate: true,
			},
			ocrText: {
				status: 'COMPLETED',
				engine: 'tesseract',
				charCount: 42,
			},
			audioTranscription: {
				status: 'COMPLETED',
				segmentCount: 1,
			},
		},
		objectsAndRegions: [
			{
				observationId: `sha256:${'a'.repeat(64)}`,
				frameIndex: 14,
				timestampMs: 14000,
				kind: 'detector_box',
				label: 'person',
				confidence: 0.84,
				modelRevision: 'yolov10n-coco-v1',
				bbox: [120, 45, 380, 620],
				artifactUri: 'atlas-artifacts/keyframes/e1/f14_bbox.json',
				coordinateSpace: 'source_pixel',
				reviewStatus: 'unreviewed',
				reviewedBy: null,
			},
			{
				observationId: `sha256:${'b'.repeat(64)}`,
				frameIndex: 14,
				timestampMs: 14000,
				kind: 'segmentation_mask',
				label: 'person',
				confidence: 0.64,
				modelRevision: 'sam2-base-v1',
				bbox: [100, 400, 200, 600],
				artifactUri: 'atlas-artifacts/keyframes/e1/f14_sam2_mask_01.png',
				coordinateSpace: 'source_pixel',
				reviewStatus: 'accepted',
				reviewedBy: 11,
			},
		],
		sceneContextProposals: [
			{
				proposalId: 'prop-ctx-1',
				frameIndex: 14,
				contextLabel: 'courtroom_interior',
				proposalSource: 'vlm_scene_caption',
				confidence: 0.88,
				reviewStatus: 'unreviewed',
				reviewedBy: null,
			},
		],
		textAndSpeech: {
			ocrSpans: [
				{
					spanId: 'ocr-1',
					frameIndex: 14,
					text: "Sorry to hear this happened to you, we'll get worki",
					bbox: [40, 500, 600, 620],
					confidence: 0.95,
				},
			],
			transcriptSegments: [
				{
					segmentId: 'seg-1',
					startMs: 13500,
					endMs: 15000,
					text: "Sorry to hear this happened to you",
					speakerTag: null,
				},
			],
		},
		eventProposals: [
			{
				proposalId: 'evt-prop-1',
				timestampMs: 14000,
				durationMs: 2000,
				action: 'speaking_dialogue',
				citations: [
					{
						source: 'image_observation',
						evidence_id: EVIDENCE_ID,
						source_revision: REVISION,
						frame_timestamp_s: 14,
						frame_index: 14,
						observation_kind: 'detection',
						artifact_uri: 'atlas-artifacts/keyframes/e1/f14_bbox.json',
					},
				],
				roleAssignments: [
					{
						actorLabel: 'Speaker in Blue Suit',
						proposedRole: 'attorney',
						rationale: 'Seated at defense counsel podium addressing court.',
						supportedByCitation: true,
					},
				],
				reviewStatus: 'unreviewed',
			},
		],
		unknowns: {
			unexaminedFrames: [0, 1, 2],
			unclassifiedRegions: [
				{
					frameIndex: 14,
					bbox: [500, 500, 640, 640],
					reason: 'reviewer_marked_unknown',
				},
			],
			stageFailures: [],
		},
		activeCoordinateSpace: 'source_pixel',
		calibrationTransformRevision: null,
		...overrides,
	};
}

describe('SceneObservationManifestSchemaV1', () => {
	it('parses a complete valid manifest with distinct segregated streams', () => {
		const fixture = createFixtureManifest();
		const parsed = SceneObservationManifestSchemaV1.parse(fixture);
		expect(parsed.schemaVersion).toBe('atlas.scene-observation-manifest.v1');
		expect(parsed.objectsAndRegions).toHaveLength(2);
		expect(parsed.sceneContextProposals).toHaveLength(1);
		expect(parsed.textAndSpeech.ocrSpans).toHaveLength(1);
		expect(parsed.unknowns.unclassifiedRegions).toHaveLength(1);
	});

	it('permits camera_2_5d_relative coordinate space without calibrationTransformRevision', () => {
		const fixture = createFixtureManifest({
			activeCoordinateSpace: 'camera_2_5d_relative',
			calibrationTransformRevision: null,
		});
		expect(() => SceneObservationManifestSchemaV1.parse(fixture)).not.toThrow();
	});

	it('rejects calibrated_ground_plane coordinate space without calibrationTransformRevision', () => {
		const fixture = createFixtureManifest({
			activeCoordinateSpace: 'calibrated_ground_plane',
			calibrationTransformRevision: null,
		});
		expect(() => SceneObservationManifestSchemaV1.parse(fixture)).toThrow(
			/cannot be calibrated_ground_plane or world_shared without calibrationTransformRevision/,
		);
	});

	it('accepts calibrated_ground_plane when an admitted calibration revision is provided', () => {
		const fixture = createFixtureManifest({
			activeCoordinateSpace: 'calibrated_ground_plane',
			calibrationTransformRevision: 'rev:calib-floor-matrix-v1',
		});
		expect(() => SceneObservationManifestSchemaV1.parse(fixture)).not.toThrow();
	});

	it('rejects an invalid sourceRevision format', () => {
		const fixture = createFixtureManifest({
			sourceRevision: 'invalid-hash-string',
		});
		expect(() => SceneObservationManifestSchemaV1.parse(fixture)).toThrow();
	});

	it('computes deterministic observationIds matching sha256 output', () => {
		const id1 = computeObservationId({
			sourceRevision: REVISION,
			analysisRevision: 'analysis-rev-1',
			frameIndex: 14,
			ordinal: 0,
			artifactSha256: SHA256_HEX,
			modelRevision: 'yolov10n-coco-v1',
			label: 'person',
			bbox: [120, 45, 380, 620],
		});
		const id2 = computeObservationId({
			sourceRevision: REVISION,
			analysisRevision: 'analysis-rev-1',
			frameIndex: 14,
			ordinal: 0,
			artifactSha256: SHA256_HEX,
			modelRevision: 'yolov10n-coco-v1',
			label: 'person',
			bbox: [120, 45, 380, 620],
		});
		expect(id1).toBe(id2);
		expect(id1).toMatch(/^sha256:[a-f0-9]{64}$/);
	});
});
