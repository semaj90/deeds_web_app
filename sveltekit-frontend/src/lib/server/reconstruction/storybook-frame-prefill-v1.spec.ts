import { describe, expect, it } from 'vitest';
import { SceneIntentSchema } from './crime-scene-schema.js';
import { acceptsStorybookFrameIntentV1, buildStorybookFramePrefillV1 } from './storybook-frame-prefill-v1.js';
import type { VideoStorybookCoverageV1 } from '$lib/server/features/evidence/video/video-storybook-coverage-v1.js';

const sha = (character: string) => `sha256:${character.repeat(64)}`;
const caseId = '00000000-0000-4000-8000-0000000000bb';
const locator = { evidenceId: '00000000-0000-4000-8000-0000000000aa', sourceRevision: sha('a'),
	analysisRevision: 'analysis-1', frameIndex: 0, artifactSha256: sha('b') };
const coverage: VideoStorybookCoverageV1 = {
	schema: 'atlas.video-storybook-coverage.v1', evidenceId: locator.evidenceId, sourceRevision: locator.sourceRevision,
	analysisRevision: locator.analysisRevision, analysisJobId: '00000000-0000-4000-8000-0000000000cc',
	coverage: 'SAMPLED_FRAMES', omittedFrameCount: 0, transcriptionStatus: 'NOT_RECORDED', reviewedEventCount: 0,
	frames: [{ frameIndex: 0, timestampMs: 250, artifactSha256: locator.artifactSha256, width: 100, height: 80,
		detectionStatus: 'COMPLETED', omittedDetectionCount: 0, ocr: null,
		detections: [{ label: 'person', confidence: 0.8, modelRevision: 'yolox-1', bbox: [0, 0, 80, 60], observationId: sha('c'), ordinal: 0 }] }],
};
const citation = {
	source: 'image_observation', evidence_id: locator.evidenceId, source_revision: locator.sourceRevision,
	frame_timestamp_s: 0.25, frame_index: 0, observation_id: sha('c'), observation_kind: 'detection', model_version: 'yolox-1',
};

function draft(citations: unknown[], role = 'unknown') {
	const actor = { actor_id: 'actor-1', role, label: 'Unidentified person' };
	return SceneIntentSchema.parse({ scene_id: 'draft', case_id: caseId, title: 'Frame review', duration_s: 20,
		environment: { city: 'unspecified' }, actors: [actor], events: [{ id: 'beat-1', time_s: 0, duration_s: 10,
			who: [actor], what: 'Review a person detection.', how: 'Inspect the labelled region.',
			action: 'idle', kind: 'hypothesis', confidence: 'low', citations }] });
}

describe('storybook frame prefill', () => {
	it('binds the current frame and emits a reproducible prefill digest', () => {
		const prefill = buildStorybookFramePrefillV1(coverage, locator);
		expect(prefill?.prefillSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
		expect(buildStorybookFramePrefillV1(coverage, locator)).toEqual(prefill);
		expect(buildStorybookFramePrefillV1(coverage, { ...locator, artifactSha256: sha('d') })).toBeNull();
		expect(buildStorybookFramePrefillV1(coverage, { ...locator, analysisRevision: 'stale' })).toBeNull();
	});

	it('admits only a hypothetical draft with exact detector citations and no assigned case roles', () => {
		const prefill = buildStorybookFramePrefillV1(coverage, locator)!;
		expect(acceptsStorybookFrameIntentV1(draft([citation]), caseId, prefill)).toBe(true);
		expect(acceptsStorybookFrameIntentV1(draft([]), caseId, prefill)).toBe(false);
		expect(acceptsStorybookFrameIntentV1(draft([{ ...citation, observation_id: sha('d') }]), caseId, prefill)).toBe(false);
		expect(acceptsStorybookFrameIntentV1(draft([{ ...citation, frame_timestamp_s: 0.2 }]), caseId, prefill)).toBe(false);
		expect(acceptsStorybookFrameIntentV1(draft([citation], 'suspect'), caseId, prefill)).toBe(false);
	});
});
