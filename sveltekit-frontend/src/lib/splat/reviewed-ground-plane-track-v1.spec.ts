// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { humanCoco17PoseSchemaV1 } from '$lib/shared/pose-skeleton-schema-v1.js';
import { createPlanarCameraCalibrationV1 } from './planar-camera-calibration-v1.js';
import { deriveReviewedGroundPlaneTrackFromHistoryV1, deriveReviewedGroundPlaneTrackV1 } from './reviewed-ground-plane-track-v1.js';

const evidenceId = '22222222-2222-4222-8222-222222222222';
const caseId = '11111111-1111-4111-8111-111111111111';
const sourceSha256 = `sha256:${'a'.repeat(64)}`;
const calibrationRevisionId = '33333333-3333-4333-8333-333333333333';

function fixture() {
	const calibration = createPlanarCameraCalibrationV1({
		evidenceId, sourceRevision: sourceSha256, analysisRevision: 'run-1', calibrationFrameIndex: 0,
		calibrationFramePtsUs: 0, frameWidth: 640, frameHeight: 480, operatorConfirmedFixedCamera: true,
		fitAnchors: [
			{ id: 'a', imagePx: [0, 0], planeM: [0, 0] }, { id: 'b', imagePx: [640, 0], planeM: [6.4, 0] },
			{ id: 'c', imagePx: [640, 480], planeM: [6.4, 4.8] }, { id: 'd', imagePx: [0, 480], planeM: [0, 4.8] },
		],
		validationAnchors: [
			{ id: 'v1', imagePx: [160, 120], planeM: [1.6, 1.2] }, { id: 'v2', imagePx: [480, 120], planeM: [4.8, 1.2] },
			{ id: 'v3', imagePx: [480, 360], planeM: [4.8, 3.6] }, { id: 'v4', imagePx: [160, 360], planeM: [1.6, 3.6] },
		], toleranceMeters: 0.001,
	});
	const calibrationSha256 = `sha256:${createHash('sha256').update(JSON.stringify(calibration), 'utf8').digest('hex')}`;
	const pose = {
		schema: 'atlas.pose-observation.v1', evidenceId, sourceSha256, sourceRevision: sourceSha256, analysisRevision: 'run-1',
		framePtsUs: 1_000_000, frameIndex: 30, frameWidth: 640, frameHeight: 480, skeletonSchemaId: humanCoco17PoseSchemaV1.schemaId,
		trackId: 'track-1', trackScopeId: 'scope-run-1', origin: 'manual', modelRevision: null, reviewState: 'UNREVIEWED',
		keypoints: humanCoco17PoseSchemaV1.joints.map(({ index }) => ({ index, x: null, y: null, confidence: 0, visibility: 'not_labeled' })),
		groundContact: { imagePx: [320, 240], footSide: 'left', label: 'operator-marked-ground-contact-candidate' },
	};
	const calibrationDecision = {
		schema: 'atlas.planar-camera-calibration-review.v1' as const, evidenceId, caseId, sourceSha256,
		analysisRevision: 'run-1', annotationRevisionId: calibrationRevisionId, calibrationSha256,
		calibrationFrameIndex: 0, calibrationFramePtsUs: 0, decision: 'ACCEPTED_FOR_SCENE_PROPOSAL' as const,
		sceneAdmission: 'APPROVED_FOR_SCENE_PROPOSAL' as const, canonicalAuthority: false as const,
	};
	const sample = {
		pose, annotationRevisionId: '44444444-4444-4444-8444-444444444444',
		reviewDecision: 'ACCEPTED_FOR_SCENE_PROPOSAL' as const, groundContactReviewed: true,
		sceneAdmission: 'APPROVED_FOR_SCENE_PROPOSAL' as const, canonicalAuthority: false as const,
		groundContactDecision: 'ACCEPTED_FOR_SCENE_PROPOSAL' as const,
	};
	return { calibration, calibrationSha256, calibrationDecision, sample };
}

describe('reviewed ground-plane track v1', () => {
	it('projects only explicitly marked contact points after exact calibration and pose review', async () => {
		const input = fixture();
		const result = await deriveReviewedGroundPlaneTrackV1({
			calibration: input.calibration, calibrationRevisionId, calibrationDecision: input.calibrationDecision,
			samples: [input.sample],
		});
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({ frameIndex: 30, framePtsUs: 1_000_000, trackId: 'track-1', status: 'REVIEWED_GROUND_PLANE_PROPOSAL' });
		expect(result[0]!.planeM[0]).toBeCloseTo(3.2, 8);
		expect(result[0]!.planeM[1]).toBeCloseTo(2.4, 8);
	});

	it('does not project rejected or unreviewed contact samples', async () => {
		const input = fixture();
		const result = await deriveReviewedGroundPlaneTrackV1({
			calibration: input.calibration, calibrationRevisionId, calibrationDecision: input.calibrationDecision,
			samples: [
				{ ...input.sample, reviewDecision: 'REJECTED' },
				{ ...input.sample, sceneAdmission: 'NOT_ADMITTED' },
				{ ...input.sample, canonicalAuthority: true } as unknown as typeof input.sample,
				{ ...input.sample, groundContactReviewed: false },
				{ ...input.sample, groundContactDecision: 'REJECTED' },
			],
		});
		expect(result).toEqual([]);
	});

	it('fails closed for calibration hash, revision, decision, or sample source mismatch', async () => {
		const input = fixture();
		const args = { calibration: input.calibration, calibrationRevisionId, calibrationDecision: input.calibrationDecision, samples: [input.sample] };
		await expect(deriveReviewedGroundPlaneTrackV1({ ...args, calibrationDecision: { ...input.calibrationDecision, calibrationSha256: `sha256:${'b'.repeat(64)}` } })).rejects.toThrow(/HASH_MISMATCH/);
		await expect(deriveReviewedGroundPlaneTrackV1({ ...args, calibrationDecision: { ...input.calibrationDecision, decision: 'REJECTED' } })).rejects.toThrow(/REVIEW_MISMATCH/);
		await expect(deriveReviewedGroundPlaneTrackV1({ ...args, samples: [{ ...input.sample, pose: { ...input.sample.pose, sourceRevision: `sha256:${'b'.repeat(64)}` } }] })).rejects.toThrow(/SOURCE_OR_FRAME_MISMATCH/);
	});

	it('assembles only accepted, exact-revision decisions from authorized revision-history shape', async () => {
		const input = fixture();
		const history = { versions: [
			{ id: 'contact-decision', version: 4, metadata: {
				schema: 'atlas.pose-review-decision.v1', evidenceId, caseId, sourceSha256, analysisRevision: 'run-1',
				annotationRevisionId: input.sample.annotationRevisionId, framePtsUs: input.sample.pose.framePtsUs,
				trackId: input.sample.pose.trackId, trackScopeId: input.sample.pose.trackScopeId,
				decision: 'ACCEPTED_FOR_SCENE_PROPOSAL', sceneAdmission: 'APPROVED_FOR_SCENE_PROPOSAL',
				groundContactReviewed: true, groundContactDecision: 'ACCEPTED_FOR_SCENE_PROPOSAL', canonicalAuthority: false,
			} },
			{ id: input.sample.annotationRevisionId, version: 3, metadata: { schema: 'atlas.evidence-annotation-revision.v1', parentSha256: sourceSha256,
				annotation: { poseObservations: [input.sample.pose] } } },
			{ id: 'calibration-decision', version: 2, metadata: input.calibrationDecision },
			{ id: calibrationRevisionId, version: 1, metadata: { schema: 'atlas.evidence-annotation-revision.v1', parentSha256: sourceSha256,
				annotation: { planarCameraCalibrations: [input.calibration] } } },
		] };
		const points = await deriveReviewedGroundPlaneTrackFromHistoryV1({ history, evidenceId, caseId, sourceRevision: sourceSha256, analysisRevision: 'run-1' });
		expect(points).toHaveLength(1);
		expect(points[0]).toMatchObject({ poseAnnotationRevisionId: input.sample.annotationRevisionId, calibrationRevisionId, status: 'REVIEWED_GROUND_PLANE_PROPOSAL' });
		const forgedAuthority = structuredClone(history);
		(forgedAuthority.versions[0]!.metadata as Record<string, unknown>).canonicalAuthority = true;
		expect(await deriveReviewedGroundPlaneTrackFromHistoryV1({ history: forgedAuthority, evidenceId, caseId, sourceRevision: sourceSha256, analysisRevision: 'run-1' })).toEqual([]);
	});
});
