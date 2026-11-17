// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	canonicalJsonV1,
	parseSceneIntentV1,
	sceneIntentSha256V1,
	SCENE_INTENT_SCHEMA_V1,
} from './scene-intent-v1.js';

const fixture = JSON.parse(
	readFileSync(new URL('./fixtures/sample-video-0f067235.clip-window.json', import.meta.url), 'utf8')
) as { provenance: { evidenceId: string; sourceRevision: string } };

const EVIDENCE_ID = fixture.provenance.evidenceId;
const SOURCE_REVISION = fixture.provenance.sourceRevision;

function validIntent() {
	return {
		schemaVersion: SCENE_INTENT_SCHEMA_V1,
		clipSeconds: 20,
		outputForm: 'storyboard-2d',
		seed: 7,
		beats: [
			{
				id: 'beat-01',
				text: 'The speaker explains that font subsetting shrinks the download.',
				kind: 'measured',
				startSec: 1,
				endSec: 8,
				citations: [
					{ source: 'transcript_segment', evidenceId: EVIDENCE_ID, sourceRevision: SOURCE_REVISION, startMs: 575600, endMs: 580000 },
				],
			},
		],
	};
}

describe('SceneIntent v1', () => {
	it('accepts a valid intent cited to the real evidence revision', () => {
		expect(parseSceneIntentV1(validIntent()).beats).toHaveLength(1);
	});

	it('rejects a beat with no citation', () => {
		const raw = validIntent();
		raw.beats[0].citations = [];
		expect(() => parseSceneIntentV1(raw)).toThrow();
	});

	it('rejects a measured beat that cites a timeline event', () => {
		const raw = validIntent();
		raw.beats[0].citations = [{ source: 'timeline_event', evidenceId: EVIDENCE_ID, sourceRevision: SOURCE_REVISION, eventRef: 'event-1' }] as never;
		expect(() => parseSceneIntentV1(raw)).toThrow(/measured beat may not cite a timeline_event/);
	});

	it('accepts a hypothesis beat that cites a timeline event', () => {
		const raw = validIntent();
		raw.beats[0].kind = 'hypothesis';
		raw.beats[0].citations = [{ source: 'timeline_event', evidenceId: EVIDENCE_ID, sourceRevision: SOURCE_REVISION, eventRef: 'event-1' }] as never;
		expect(parseSceneIntentV1(raw).beats[0].kind).toBe('hypothesis');
	});

	it('rejects a beat that runs past the 20 s clip', () => {
		const raw = validIntent();
		raw.beats[0].endSec = 21;
		expect(() => parseSceneIntentV1(raw)).toThrow(/ends after the 20 s clip/);
	});

	it('rejects a clip length other than the decided 20 s', () => {
		const raw = { ...validIntent(), clipSeconds: 30 };
		expect(() => parseSceneIntentV1(raw)).toThrow();
	});

	it('rejects a malformed source revision', () => {
		const raw = validIntent();
		raw.beats[0].citations[0].sourceRevision = 'sha256:ABC';
		expect(() => parseSceneIntentV1(raw)).toThrow();
	});

	it('rejects duplicate beat ids', () => {
		const raw = validIntent();
		raw.beats.push({ ...raw.beats[0] });
		expect(() => parseSceneIntentV1(raw)).toThrow(/duplicate beat id/);
	});
});

describe('SceneIntent canonical hash', () => {
	it('gives the same bytes and hash regardless of key order', () => {
		const a = parseSceneIntentV1(validIntent());
		const reverseKeys = (value: unknown): unknown => {
			if (Array.isArray(value)) return value.map(reverseKeys);
			if (value === null || typeof value !== 'object') return value;
			const out: Record<string, unknown> = {};
			for (const key of Object.keys(value).reverse()) out[key] = reverseKeys((value as Record<string, unknown>)[key]);
			return out;
		};
		const reordered = parseSceneIntentV1(reverseKeys(validIntent()));
		expect(canonicalJsonV1(reordered)).toBe(canonicalJsonV1(a));
		expect(sceneIntentSha256V1(reordered)).toBe(sceneIntentSha256V1(a));
	});

	it('changes the hash when any field changes', () => {
		const a = parseSceneIntentV1(validIntent());
		const raw = validIntent();
		raw.seed = 8;
		expect(sceneIntentSha256V1(parseSceneIntentV1(raw))).not.toBe(sceneIntentSha256V1(a));
	});

	it('emits sha256:<64 lowercase hex>', () => {
		expect(sceneIntentSha256V1(parseSceneIntentV1(validIntent()))).toMatch(/^sha256:[0-9a-f]{64}$/);
	});
});
