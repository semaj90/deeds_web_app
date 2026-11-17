import { describe, expect, it } from 'vitest';
import { joinSceneVideoEventReadbackV1, parseReadbackVideoTimelineV1, parseScenePoseReadbackV1, poseHipImageTrajectoryV1, type SceneVideoEventBindingV1, type ReadbackVideoTimelineV1 } from './scene-video-event-readback-v1.js';

const binding: SceneVideoEventBindingV1 = {
	evidenceId: '11111111-1111-4111-8111-111111111111',
	sourceRevision: `sha256:${'a'.repeat(64)}`,
	analysisRevision: 'analysis-r2',
	eventId: '22222222-2222-4222-8222-222222222222',
	startMs: 10_000,
	endMs: 12_000,
	reviewState: 'APPROVED_FOR_SCENE_PROPOSAL'
};

const timeline: ReadbackVideoTimelineV1 = {
	evidenceId: binding.evidenceId,
	sourceRevision: binding.sourceRevision,
	analysisRevision: binding.analysisRevision,
	events: [{
		eventId: binding.eventId,
		startMs: binding.startMs,
		endMs: binding.endMs,
		label: 'Person enters room',
		summary: 'A person appears in the sampled frames.',
		reviewStatus: 'APPROVED',
		sceneAdmission: 'APPROVED_FOR_SCENE_PROPOSAL'
	}]
};

function poseObservation(overrides: Record<string, unknown> = {}) {
	return {
		schema: 'atlas.pose-observation.v1', evidenceId: binding.evidenceId,
		sourceSha256: binding.sourceRevision, sourceRevision: binding.sourceRevision,
		analysisRevision: binding.analysisRevision, framePtsUs: 11_000_000, frameIndex: 11,
		frameWidth: 640, frameHeight: 360, skeletonSchemaId: 'human.coco17.v1',
		trackId: null, trackScopeId: null, origin: 'manual', modelRevision: null, reviewState: 'UNREVIEWED',
		keypoints: Array.from({ length: 17 }, (_, index) => ({
			index, x: index === 0 ? 120 : null, y: index === 0 ? 80 : null,
			confidence: index === 0 ? 1 : 0, visibility: index === 0 ? 'visible' : 'not_labeled'
		})),
		...overrides
	};
}

describe('scene video event readback v1', () => {
	it('joins only the approved event at the exact evidence, revisions, and interval', () => {
		expect(joinSceneVideoEventReadbackV1([binding], new Map([[binding.evidenceId, timeline]]))[0].event?.label)
			.toBe('Person enters room');
	});

	it('fails closed when source/run/interval differs or approval is absent', () => {
		const changed = { ...timeline, sourceRevision: `sha256:${'b'.repeat(64)}` };
		expect(joinSceneVideoEventReadbackV1([binding], new Map([[binding.evidenceId, changed]]))[0].event).toBeNull();
		const changedInterval = { ...timeline, events: [{ ...timeline.events[0], endMs: 12_001 }] };
		expect(joinSceneVideoEventReadbackV1([binding], new Map([[binding.evidenceId, changedInterval]]))[0].event).toBeNull();
		const unapproved = { ...timeline, events: [{ ...timeline.events[0], reviewStatus: 'PROPOSED' }] };
		expect(joinSceneVideoEventReadbackV1([binding], new Map([[binding.evidenceId, unapproved]]))[0].event).toBeNull();
	});

	it('rejects malformed or cross-evidence timeline responses', () => {
		expect(parseReadbackVideoTimelineV1({ ...timeline, evidenceId: '33333333-3333-4333-8333-333333333333' }, binding.evidenceId)).toBeNull();
		expect(parseReadbackVideoTimelineV1({ events: [] }, binding.evidenceId)).toBeNull();
	});

	it('reads only pose annotations from the scene-bound evidence and analysis revision', () => {
		const versions = { versions: [
			{ id: 'pose-r1', version: 3, metadata: { annotation: { poseObservations: [poseObservation()] } } },
			{ version: 4, metadata: { annotation: { poseObservations: [poseObservation({ sourceRevision: `sha256:${'b'.repeat(64)}`, sourceSha256: `sha256:${'b'.repeat(64)}` })] } } },
			{ version: 5, metadata: { annotation: { poseObservations: [poseObservation({ analysisRevision: 'other-run' })] } } }
		] };
		expect(parseScenePoseReadbackV1(versions, [binding])).toEqual([{
			evidenceId: binding.evidenceId, sourceRevision: binding.sourceRevision, analysisRevision: binding.analysisRevision,
			frameIndex: 11, framePtsUs: 11_000_000, frameWidth: 640, frameHeight: 360,
			keypoints: expect.arrayContaining([{ index: 0, x: 120, y: 80, visibility: 'visible' }]),
			trackId: null, trackScopeId: null, placedKeypoints: 1, totalKeypoints: 17,
			reviewState: 'UNREVIEWED', annotationRevision: 3,
			reviewDecision: null, sceneAdmission: 'NOT_ADMITTED'
		}]);
	});

	it('joins the latest review only to the exact annotation revision and source run', () => {
		const versions = { versions: [
			{ id: 'pose-r1', version: 3, metadata: { annotation: { poseObservations: [poseObservation()] } } },
			{ id: 'decision-r2', version: 4, metadata: {
				schema: 'atlas.pose-review-decision.v1', evidenceId: binding.evidenceId,
				sourceSha256: binding.sourceRevision, analysisRevision: binding.analysisRevision,
				annotationRevisionId: 'pose-r1', framePtsUs: 11_000_000, skeletonSchemaId: 'human.coco17.v1',
				trackId: null, trackScopeId: null, decision: 'ACCEPTED_FOR_SCENE_PROPOSAL', sceneAdmission: 'APPROVED_FOR_SCENE_PROPOSAL',
			} },
			{ id: 'stale-decision', version: 5, metadata: {
				schema: 'atlas.pose-review-decision.v1', evidenceId: binding.evidenceId,
				sourceSha256: `sha256:${'b'.repeat(64)}`, analysisRevision: binding.analysisRevision,
				annotationRevisionId: 'pose-r1', framePtsUs: 11_000_000, skeletonSchemaId: 'human.coco17.v1',
				trackId: null, trackScopeId: null, decision: 'REJECTED', sceneAdmission: 'NOT_ADMITTED',
			} },
		] };
		expect(parseScenePoseReadbackV1(versions, [binding])[0]).toMatchObject({
			annotationRevision: 3, reviewState: 'UNREVIEWED',
			reviewDecision: 'ACCEPTED_FOR_SCENE_PROPOSAL', sceneAdmission: 'APPROVED_FOR_SCENE_PROPOSAL',
		});
	});

	it('builds a bounded image-space hip trail only for the exact clip-scoped track', () => {
		const hips = (offset: number) => Array.from({ length: 17 }, (_, index) => ({
			index, x: index === 11 || index === 12 ? 10 + offset + index - 11 : null,
			y: index === 11 || index === 12 ? 20 : null, confidence: 1,
			visibility: index === 11 || index === 12 ? 'visible' : 'not_labeled'
		}));
		const first = poseObservation({ trackId: 'person-1', trackScopeId: 'scope-a', framePtsUs: 1_000_000, frameIndex: 1, keypoints: hips(0) });
		const currentPose = poseObservation({ trackId: 'person-1', trackScopeId: 'scope-a', framePtsUs: 2_000_000, frameIndex: 2, keypoints: hips(10) });
		const otherScope = poseObservation({ trackId: 'person-1', trackScopeId: 'scope-b', framePtsUs: 3_000_000, frameIndex: 3, keypoints: hips(20) });
		const versions = { versions: [first, currentPose, otherScope].map((pose, index) => ({ id: `pose-${index}`, version: index + 1, metadata: { annotation: { poseObservations: [pose] } } })) };
		const poses = parseScenePoseReadbackV1(versions, [binding]);
		const current = poses.find((pose) => pose.trackScopeId === 'scope-a' && pose.frameIndex === 2)!;
		expect(poseHipImageTrajectoryV1(poses, current)).toEqual([
			{ frameIndex: 1, framePtsUs: 1_000_000, x: 10.5, y: 20, current: false },
			{ frameIndex: 2, framePtsUs: 2_000_000, x: 20.5, y: 20, current: true },
		]);
		expect(poseHipImageTrajectoryV1(poses, { ...current, trackScopeId: null })).toEqual([]);
		const longTrail = Array.from({ length: 40 }, (_, index) => ({ ...current, framePtsUs: index * 1000, frameIndex: index,
			keypoints: current.keypoints.map((point) => ({ ...point, x: point.x === null ? null : point.x + index })) }));
		expect(poseHipImageTrajectoryV1(longTrail, current, 8)).toHaveLength(8);
	});
});
