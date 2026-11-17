import { planarCameraCalibrationV1Schema, projectImagePointToPlaneV1, type PlanarCameraCalibrationV1 } from './planar-camera-calibration-v1.js';
import { humanCoco17PoseSchemaV1, parsePoseObservationV1, type PoseObservationV1 } from '$lib/shared/pose-skeleton-schema-v1.js';

export type ReviewedCalibrationDecisionV1 = {
	schema: 'atlas.planar-camera-calibration-review.v1';
	evidenceId: string;
	caseId: string;
	sourceSha256: string;
	analysisRevision: string;
	annotationRevisionId: string;
	calibrationSha256: string;
	calibrationFrameIndex: number;
	calibrationFramePtsUs: number;
	decision: 'ACCEPTED_FOR_SCENE_PROPOSAL' | 'REJECTED';
	sceneAdmission: 'APPROVED_FOR_SCENE_PROPOSAL' | 'NOT_ADMITTED';
	canonicalAuthority: false;
};

export type ReviewedPoseSampleV1 = {
	pose: PoseObservationV1;
	annotationRevisionId: string;
	reviewDecision: 'ACCEPTED_FOR_SCENE_PROPOSAL' | 'REJECTED' | null;
	sceneAdmission: 'APPROVED_FOR_SCENE_PROPOSAL' | 'NOT_ADMITTED';
	canonicalAuthority: false;
	groundContactReviewed: boolean;
	groundContactDecision: 'ACCEPTED_FOR_SCENE_PROPOSAL' | 'REJECTED' | 'NOT_PRESENT';
};

export type ReviewedGroundPlanePointV1 = {
	frameIndex: number;
	framePtsUs: number;
	trackId: string | null;
	trackScopeId: string | null;
	imagePx: [number, number];
	planeM: [number, number];
	calibrationRevisionId: string;
	poseAnnotationRevisionId: string;
	status: 'REVIEWED_GROUND_PLANE_PROPOSAL';
	semantics: PlanarCameraCalibrationV1['semantics'];
};

/**
 * Projects only explicit, manually marked ground-contact candidates after both
 * the exact calibration and exact pose sample have been reviewed. The output is
 * a measured-plane proposal, never canonical scene geometry or a 3D body pose.
 */
export async function deriveReviewedGroundPlaneTrackV1(input: {
	calibration: unknown;
	calibrationRevisionId: string;
	calibrationDecision: ReviewedCalibrationDecisionV1;
	samples: readonly ReviewedPoseSampleV1[];
}): Promise<ReviewedGroundPlanePointV1[]> {
	const parsed = planarCameraCalibrationV1Schema.parse(input.calibration) as unknown as PlanarCameraCalibrationV1;
	const decision = input.calibrationDecision;
	if (!input.calibrationRevisionId || decision.schema !== 'atlas.planar-camera-calibration-review.v1'
		|| decision.decision !== 'ACCEPTED_FOR_SCENE_PROPOSAL' || decision.sceneAdmission !== 'APPROVED_FOR_SCENE_PROPOSAL'
		|| decision.canonicalAuthority !== false || decision.annotationRevisionId !== input.calibrationRevisionId
		|| decision.evidenceId !== parsed.evidenceId || decision.sourceSha256 !== parsed.sourceRevision
		|| decision.analysisRevision !== parsed.analysisRevision || decision.calibrationFrameIndex !== parsed.calibrationFrameIndex
		|| decision.calibrationFramePtsUs !== parsed.calibrationFramePtsUs) {
		throw new RangeError('GROUND_PLANE_CALIBRATION_REVIEW_MISMATCH');
	}
	const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(parsed))));
	const calibrationSha256 = `sha256:${Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
	if (decision.calibrationSha256 !== calibrationSha256) throw new RangeError('GROUND_PLANE_CALIBRATION_HASH_MISMATCH');
	if (parsed.validationStatus !== 'CHECKS_PASSED') throw new RangeError('GROUND_PLANE_CALIBRATION_CHECKS_REQUIRED');
	if (input.samples.length > 4096) throw new RangeError('GROUND_PLANE_TRACK_SAMPLE_LIMIT');

	const points: ReviewedGroundPlanePointV1[] = [];
	const identities = new Set<string>();
	for (const sample of input.samples) {
		const pose = parsePoseObservationV1(sample.pose, humanCoco17PoseSchemaV1);
		if (pose.evidenceId !== parsed.evidenceId || pose.sourceSha256 !== parsed.sourceRevision
			|| pose.sourceRevision !== parsed.sourceRevision || pose.analysisRevision !== parsed.analysisRevision
			|| pose.frameWidth !== parsed.frameWidth || pose.frameHeight !== parsed.frameHeight) {
			throw new RangeError('GROUND_PLANE_POSE_SOURCE_OR_FRAME_MISMATCH');
		}
		if (sample.reviewDecision !== 'ACCEPTED_FOR_SCENE_PROPOSAL' || sample.sceneAdmission !== 'APPROVED_FOR_SCENE_PROPOSAL'
			|| sample.canonicalAuthority !== false || !sample.groundContactReviewed
			|| sample.groundContactDecision !== 'ACCEPTED_FOR_SCENE_PROPOSAL' || !sample.annotationRevisionId) continue;
		if (!pose.groundContact) continue;
		const identity = `${pose.framePtsUs}:${pose.trackId ?? ''}:${pose.trackScopeId ?? ''}`;
		if (identities.has(identity)) throw new RangeError('GROUND_PLANE_TRACK_DUPLICATE_SAMPLE');
		identities.add(identity);
		const projection = projectImagePointToPlaneV1(parsed, {
			evidenceId: pose.evidenceId,
			sourceRevision: pose.sourceRevision,
			analysisRevision: pose.analysisRevision,
			frameWidth: pose.frameWidth,
			frameHeight: pose.frameHeight,
			imagePx: [pose.groundContact.imagePx[0]!, pose.groundContact.imagePx[1]!] as [number, number],
		});
		points.push({
			frameIndex: pose.frameIndex,
			framePtsUs: pose.framePtsUs,
			trackId: pose.trackId,
			trackScopeId: pose.trackScopeId,
			imagePx: [pose.groundContact.imagePx[0], pose.groundContact.imagePx[1]],
			planeM: [projection.planeM[0], projection.planeM[1]],
			calibrationRevisionId: input.calibrationRevisionId,
			poseAnnotationRevisionId: sample.annotationRevisionId,
			status: 'REVIEWED_GROUND_PLANE_PROPOSAL',
			semantics: projection.semantics,
		});
	}
	return points.sort((a, b) => a.framePtsUs - b.framePtsUs || (a.trackId ?? '').localeCompare(b.trackId ?? ''));
}

/** Readback adapter: derives display proposals from an authorized versions response. */
export async function deriveReviewedGroundPlaneTrackFromHistoryV1(input: {
	history: unknown;
	evidenceId: string;
	caseId: string;
	sourceRevision: string;
	analysisRevision: string;
}): Promise<ReviewedGroundPlanePointV1[]> {
	if (!input.history || typeof input.history !== 'object' || !Array.isArray((input.history as { versions?: unknown }).versions)) return [];
	const versions = (input.history as { versions: unknown[] }).versions;
	const annotationById = new Map<string, { version: number; annotation: Record<string, unknown> }>();
	const calibrationReviews = new Map<string, ReviewedCalibrationDecisionV1>();
	const poseReviews = new Map<string, ReviewedPoseSampleV1>();
	for (const row of versions) {
		if (!row || typeof row !== 'object') continue;
		const revision = row as { id?: unknown; version?: unknown; metadata?: Record<string, unknown> };
		const metadata = revision.metadata;
		if (!metadata) continue;
		if (typeof revision.id === 'string' && Number.isSafeInteger(revision.version)
			&& metadata.schema === 'atlas.evidence-annotation-revision.v1'
			&& metadata.parentSha256 === input.sourceRevision && metadata.annotation && typeof metadata.annotation === 'object' && !Array.isArray(metadata.annotation)) {
			annotationById.set(revision.id, { version: Number(revision.version), annotation: metadata.annotation as Record<string, unknown> });
		}
		if (metadata.schema === 'atlas.planar-camera-calibration-review.v1'
			&& metadata.evidenceId === input.evidenceId && metadata.caseId === input.caseId
			&& metadata.sourceSha256 === input.sourceRevision && metadata.analysisRevision === input.analysisRevision
			&& typeof metadata.annotationRevisionId === 'string' && typeof metadata.calibrationSha256 === 'string'
			&& Number.isSafeInteger(metadata.calibrationFrameIndex) && Number.isSafeInteger(metadata.calibrationFramePtsUs)
			&& (metadata.decision === 'ACCEPTED_FOR_SCENE_PROPOSAL' || metadata.decision === 'REJECTED')) {
			const key = `${metadata.annotationRevisionId}:${metadata.calibrationSha256}`;
			if (!calibrationReviews.has(key)) calibrationReviews.set(key, metadata as unknown as ReviewedCalibrationDecisionV1);
		}
		if (metadata.schema === 'atlas.pose-review-decision.v1'
			&& metadata.evidenceId === input.evidenceId && metadata.caseId === input.caseId
			&& metadata.sourceSha256 === input.sourceRevision && metadata.analysisRevision === input.analysisRevision
			&& typeof metadata.annotationRevisionId === 'string' && Number.isSafeInteger(metadata.framePtsUs)
			&& (metadata.decision === 'ACCEPTED_FOR_SCENE_PROPOSAL' || metadata.decision === 'REJECTED')
			&& (metadata.sceneAdmission === 'APPROVED_FOR_SCENE_PROPOSAL' || metadata.sceneAdmission === 'NOT_ADMITTED')
			&& metadata.canonicalAuthority === false) {
			const key = `${metadata.annotationRevisionId}:${metadata.framePtsUs}:${metadata.trackId ?? ''}:${metadata.trackScopeId ?? ''}`;
			if (!poseReviews.has(key)) poseReviews.set(key, {
				pose: {} as PoseObservationV1,
				annotationRevisionId: metadata.annotationRevisionId,
				reviewDecision: metadata.decision,
				sceneAdmission: metadata.sceneAdmission,
				canonicalAuthority: false,
				groundContactReviewed: metadata.groundContactReviewed === true,
				groundContactDecision: metadata.groundContactDecision === 'ACCEPTED_FOR_SCENE_PROPOSAL' || metadata.groundContactDecision === 'REJECTED'
					? metadata.groundContactDecision : 'NOT_PRESENT',
			});
		}
	}

	let chosenCalibration: { calibration: PlanarCameraCalibrationV1; revisionId: string; decision: ReviewedCalibrationDecisionV1 } | null = null;
	for (const [revisionId, row] of annotationById) {
		const candidates = row.annotation.planarCameraCalibrations;
		if (!Array.isArray(candidates)) continue;
		for (const candidate of candidates) {
			const parsed = planarCameraCalibrationV1Schema.safeParse(candidate);
			if (!parsed.success) continue;
			const calibration = parsed.data as unknown as PlanarCameraCalibrationV1;
			if (calibration.evidenceId !== input.evidenceId || calibration.sourceRevision !== input.sourceRevision || calibration.analysisRevision !== input.analysisRevision) continue;
			const digestBytes = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(calibration))));
			const digest = `sha256:${Array.from(digestBytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
			const decision = calibrationReviews.get(`${revisionId}:${digest}`);
			if (decision?.decision !== 'ACCEPTED_FOR_SCENE_PROPOSAL' || decision.sceneAdmission !== 'APPROVED_FOR_SCENE_PROPOSAL') continue;
			chosenCalibration = { calibration, revisionId, decision };
			break;
		}
		if (chosenCalibration) break;
	}
	if (!chosenCalibration) return [];

	const samples: ReviewedPoseSampleV1[] = [];
	for (const [revisionId, row] of annotationById) {
		const observations = row.annotation.poseObservations;
		if (!Array.isArray(observations)) continue;
		for (const raw of observations) {
			try {
				const pose = parsePoseObservationV1(raw, humanCoco17PoseSchemaV1);
				if (pose.evidenceId !== input.evidenceId || pose.sourceRevision !== input.sourceRevision || pose.analysisRevision !== input.analysisRevision) continue;
				const key = `${revisionId}:${pose.framePtsUs}:${pose.trackId ?? ''}:${pose.trackScopeId ?? ''}`;
				const review = poseReviews.get(key);
				if (!review) continue;
				samples.push({ ...review, pose });
			} catch { /* invalid annotation rows are not eligible for scene proposals */ }
		}
	}
	return deriveReviewedGroundPlaneTrackV1({
		calibration: chosenCalibration.calibration,
		calibrationRevisionId: chosenCalibration.revisionId,
		calibrationDecision: chosenCalibration.decision,
		samples,
	});
}
