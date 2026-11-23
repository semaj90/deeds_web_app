import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = ({ url }) => {
	if (!dev) error(404, 'Not found');
	const requestedCaseId = url.searchParams.get('caseId');
	const caseId = requestedCaseId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedCaseId)
		? requestedCaseId
		: '11111111-1111-4111-8111-111111111111';
	return {
		caseId,
		binding: {
			evidenceId: '33333333-3333-4333-8333-333333333333',
			sourceRevision: `sha256:${'a'.repeat(64)}`,
			analysisRevision: 'scene-event-browser-fixture-v1',
			eventId: '55555555-5555-4555-8555-555555555555',
			startMs: 1_250,
			endMs: 1_400,
			reviewState: 'APPROVED_FOR_SCENE_PROPOSAL' as const
		},
		groundPlaneTrackProposals: [{
			proposalId: '66666666-6666-4666-8666-666666666666',
			evidenceId: '33333333-3333-4333-8333-333333333333',
			sourceRevision: `sha256:${'a'.repeat(64)}`,
			analysisRevision: 'scene-event-browser-fixture-v1',
			calibrationRevisionId: '44444444-4444-4444-8444-444444444444',
			trackId: 'track-fixture',
			trackScopeId: 'sha256:fixture-track-scope',
			status: 'REVIEWED_GROUND_PLANE_PROPOSAL' as const,
			semantics: 'image_to_measured_plane_only_no_height_or_camera_motion_compensation' as const,
			points: [
				{ frameIndex: 1, framePtsUs: 1_250_000, imagePx: [40, 150] as [number, number], planeM: [0.01 * 40, 0.01 * 150] as [number, number], poseAnnotationRevisionId: '44444444-4444-4444-8444-444444444444', status: 'REVIEWED_GROUND_PLANE_PROPOSAL' as const },
				{ frameIndex: 2, framePtsUs: 1_500_000, imagePx: [70, 150] as [number, number], planeM: [0.01 * 70, 0.01 * 150] as [number, number], poseAnnotationRevisionId: '44444444-4444-4444-8444-444444444444', status: 'REVIEWED_GROUND_PLANE_PROPOSAL' as const }
			]
		}]
	};
};
