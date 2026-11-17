// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
	assertEvidenceBoundSceneIntent,
	SceneIntentSchema,
	STORYBOARD_CLIP_SECONDS,
} from './crime-scene-schema.js';

const EVIDENCE_ID = '0f067235-4957-4783-82a5-ad93bd71daab';
const REVISION = `sha256:${'f2c64f35ea2b85f8af703988ba16291c38075995c8cbf6150502cd838a04bf03'}`;

function event(overrides: Record<string, unknown> = {}) {
	return {
		id: 'evt-1',
		time_s: 1,
		duration_s: 5,
		who: [{ actor_id: 'witness-1', role: 'witness', label: 'Witness' }],
		what: 'The witness describes the font subsetting talk.',
		how: 'Seated at the stand.',
		action: 'speaking',
		confidence: 'high',
		...overrides,
	};
}

function intent(events: unknown[], duration_s = 20) {
	return {
		scene_id: 'scene-1',
		title: 'Storyboard test',
		duration_s,
		actors: [{ actor_id: 'witness-1', role: 'witness', label: 'Witness' }],
		environment: { city: 'unspecified' },
		events,
	};
}

describe('SceneIntentSchema: additive evidence provenance', () => {
	it('still accepts a legacy event with no citations or kind', () => {
		expect(() => SceneIntentSchema.parse(intent([event()]))).not.toThrow();
	});

	it('accepts a transcript citation with a source revision', () => {
		const parsed = SceneIntentSchema.parse(intent([
			event({
				kind: 'measured',
				citations: [{ source: 'transcript_segment', evidence_id: EVIDENCE_ID, source_revision: REVISION, start_ms: 575600, end_ms: 580000 }],
			}),
		]));
		expect(parsed.events[0].citations).toHaveLength(1);
	});

	it('rejects a measured event that cites a timeline event', () => {
		expect(() => SceneIntentSchema.parse(intent([
			event({
				kind: 'measured',
				citations: [{ source: 'timeline_event', evidence_id: EVIDENCE_ID, source_revision: REVISION, event_ref: 'event-1' }],
			}),
		]))).toThrow(/measured event may not cite a timeline_event/);
	});

	it('accepts a hypothesis event that cites a timeline event', () => {
		expect(() => SceneIntentSchema.parse(intent([
			event({
				kind: 'hypothesis',
				citations: [{ source: 'timeline_event', evidence_id: EVIDENCE_ID, source_revision: REVISION, event_ref: 'event-1' }],
			}),
		]))).not.toThrow();
	});

	it('rejects a malformed source revision', () => {
		expect(() => SceneIntentSchema.parse(intent([
			event({ citations: [{ source: 'scene_cut', evidence_id: EVIDENCE_ID, source_revision: 'sha256:ABC', cut_s: 3 }] }),
		]))).toThrow();
	});
});

describe('assertEvidenceBoundSceneIntent (storyboard path)', () => {
	it('keeps the decided 20 s clip length', () => {
		expect(STORYBOARD_CLIP_SECONDS).toBe(20);
	});

	it('rejects a storyboard that is not 20 s', () => {
		const parsed = SceneIntentSchema.parse(intent([event({ citations: [{ source: 'scene_cut', evidence_id: EVIDENCE_ID, source_revision: REVISION, cut_s: 3 }] })], 30));
		expect(() => assertEvidenceBoundSceneIntent(parsed)).toThrow(/storyboard duration must be 20 s/);
	});

	it('rejects a legacy event with no citation', () => {
		const parsed = SceneIntentSchema.parse(intent([event()]));
		expect(() => assertEvidenceBoundSceneIntent(parsed)).toThrow(/has no citation/);
	});

	it('rejects an event that runs past the clip', () => {
		const parsed = SceneIntentSchema.parse(intent([
			event({ time_s: 18, duration_s: 5, citations: [{ source: 'scene_cut', evidence_id: EVIDENCE_ID, source_revision: REVISION, cut_s: 3 }] }),
		]));
		expect(() => assertEvidenceBoundSceneIntent(parsed)).toThrow(/ends after the 20 s clip/);
	});

	it('accepts a cited 20 s storyboard', () => {
		const parsed = SceneIntentSchema.parse(intent([
			event({ citations: [{ source: 'transcript_segment', evidence_id: EVIDENCE_ID, source_revision: REVISION, start_ms: 575600, end_ms: 580000 }] }),
		]));
		expect(assertEvidenceBoundSceneIntent(parsed).events).toHaveLength(1);
	});
});
