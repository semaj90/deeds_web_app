import { describe, expect, it } from 'vitest';
import { buildVideoStorybookCoverageV1, matchesCurrentStorybookReviewFrameV1 } from './video-storybook-coverage-v1.js';
import { storybookRegionReviewV1Schema } from '$lib/shared/storybook-region-review-v1.js';

const sourceRevision = `sha256:${'a'.repeat(64)}`;
const artifactSha256 = `sha256:${'b'.repeat(64)}`;
const analysisRevision = 'analysis-1';
const detection = { label: 'person', confidence: 0.8, bbox: [0, 0, 100, 80] };
const frame = {
	frameIndex: 0, timestampMs: 250, width: 100, height: 80,
	sourceRevision, analysisRevision, modelRevision: 'yolox-revision',
	artifact: { sourceRevision, sha256: artifactSha256, contentType: 'image/jpeg', objectKey: 'private-frame' },
	objects: [detection],
};
const evidenceId = '00000000-0000-4000-8000-0000000000aa';
const caseId = '00000000-0000-4000-8000-0000000000bb';

function analysis(frames: unknown[], scope: Record<string, unknown> = {}) {
	return { schema: 'atlas.video-analysis.v1', sourceRevision, analysisRevision,
		analysisJobId: '00000000-0000-4000-8000-0000000000cc', frames, ...scope };
}
	
function project(frames: unknown[], scope: Record<string, unknown> = {}) {
	return buildVideoStorybookCoverageV1({ evidenceId, caseId, sourceRevision, videoAnalysis: analysis(frames, scope) });
}

describe('video storybook coverage', () => {
	it('orders actual source timestamps and omits foreign frames and invalid boxes', () => {
		const frames = [frame, { ...frame, frameIndex: 1, timestampMs: 100, objects: [{ ...detection, bbox: [0, 0, 101, 80] }] },
			{ ...frame, frameIndex: 2, analysisRevision: 'stale' }];
		const result = project(frames)!;
		expect(result.frames.map((sample) => sample.frameIndex)).toEqual([1, 0]);
		expect(result.omittedFrameCount).toBe(1);
		expect(result.frames[0]?.omittedDetectionCount).toBe(1);
		expect(result.frames[1]?.detections[0]?.observationId).toMatch(/^sha256:[a-f0-9]{64}$/);
		expect(project(frames)).toEqual(result);
		expect(JSON.stringify(result)).not.toContain('private-frame');
	});

	it('keeps failed, completed empty, and legacy unknown outcomes distinct', () => {
		const result = project([
			{ ...frame, objects: [], detectionStatus: 'FAILED' },
			{ ...frame, frameIndex: 1, objects: [], detectionStatus: 'COMPLETED' },
			{ ...frame, frameIndex: 2, objects: [] },
		], { detectorStatus: 'FAILED' });
		expect(result?.frames.map((sample) => sample.detectionStatus)).toEqual(['FAILED', 'COMPLETED', 'NOT_RECORDED']);
		expect(project([frame], { sourceRevision: artifactSha256 })).toBeNull();
	});

	it('admits an unknown cell on the exact sampled frame, even without detector output', () => {
		const review = storybookRegionReviewV1Schema.parse({ schema: 'atlas.storybook-region-review.v1', reviewId: caseId,
			analysisRevision, artifactSha256, frameIndex: 0, timestampMs: 250, width: 100, height: 80,
			column: 7, row: 3, decision: 'UNCLASSIFIED', notes: 'Partially occluded' });
		const input = { sourceRevision, videoAnalysis: analysis([{ ...frame, objects: [], detectionStatus: 'FAILED' }]), review };
		expect(matchesCurrentStorybookReviewFrameV1(input)).toBe(true);
		expect(matchesCurrentStorybookReviewFrameV1({ ...input, videoAnalysis: analysis([{ ...frame, modelRevision: undefined, objects: null }]) })).toBe(true);
		for (const change of [{ analysisRevision: 'stale' }, { frameIndex: 1 }, { artifactSha256: sourceRevision }, { timestampMs: 251 }, { width: 101 }]) {
			expect(matchesCurrentStorybookReviewFrameV1({ ...input, review: { ...review, ...change } })).toBe(false);
		}
		expect(matchesCurrentStorybookReviewFrameV1({ ...input, sourceRevision: artifactSha256 })).toBe(false);
		expect(storybookRegionReviewV1Schema.safeParse({ ...review, column: 8 }).success).toBe(false);
	});
});
