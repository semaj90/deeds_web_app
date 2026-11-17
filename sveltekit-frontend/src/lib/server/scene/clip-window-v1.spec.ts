// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CLIP_WINDOW_POLICY_V1, selectClipWindowV1 } from './clip-window-v1.js';

const fixture = JSON.parse(
	readFileSync(new URL('./fixtures/sample-video-0f067235.clip-window.json', import.meta.url), 'utf8')
) as {
	durationSec: number;
	transcriptSegments: Array<{ startMs: number; endMs: number; text: string }>;
	sceneCutsSec: number[];
};

describe('selectClipWindowV1 on real captured evidence (sample video 0f067235)', () => {
	it('selects a 20 s window with real cues, deterministically', () => {
		const input = {
			durationSec: fixture.durationSec,
			clipSeconds: 20,
			transcriptSegments: fixture.transcriptSegments,
			sceneCutsSec: fixture.sceneCutsSec,
		};
		const first = selectClipWindowV1(input);
		expect(first).toEqual(selectClipWindowV1(input));
		expect(first.policy).toBe(CLIP_WINDOW_POLICY_V1);
		expect(first.hasCues).toBe(true);
		expect(first.endSec - first.startSec).toBe(20);
		expect(first.startSec).toBeGreaterThanOrEqual(0);
		expect(first.endSec).toBeLessThanOrEqual(fixture.durationSec);
		// Pinned from the real run: the closing passage on web font subsetting.
		expect(first).toMatchObject({ startSec: 574, endSec: 594, wordCount: 70, sceneCutCount: 2 });
	});
});

describe('selectClipWindowV1 edge cases', () => {
	const seg = (startMs: number, endMs: number, text: string) => ({ startMs, endMs, text });

	it('fits an exact-length source to a single window at 0', () => {
		const w = selectClipWindowV1({ durationSec: 20, clipSeconds: 20, transcriptSegments: [seg(0, 2000, 'a b')], sceneCutsSec: [] });
		expect(w).toMatchObject({ startSec: 0, endSec: 20, wordCount: 2, hasCues: true });
	});

	it('rejects a clip longer than the source instead of clipping silently', () => {
		expect(() => selectClipWindowV1({ durationSec: 10, clipSeconds: 20, transcriptSegments: [], sceneCutsSec: [] })).toThrow(RangeError);
	});

	it('returns hasCues=false with no transcript and no cuts', () => {
		const w = selectClipWindowV1({ durationSec: 60, clipSeconds: 20, transcriptSegments: [], sceneCutsSec: [] });
		expect(w).toMatchObject({ startSec: 0, score: 0, hasCues: false });
	});

	it('breaks score ties toward the earliest start', () => {
		// One word in the middle of a 60 s source: every window that contains it ties; the earliest wins.
		const w = selectClipWindowV1({ durationSec: 60, clipSeconds: 20, transcriptSegments: [seg(30000, 30000, 'x')], sceneCutsSec: [] });
		expect(w.startSec).toBe(11);
	});

	it('counts a scene cut at the window start and excludes one at its end', () => {
		const w = selectClipWindowV1({ durationSec: 40, clipSeconds: 20, transcriptSegments: [], sceneCutsSec: [20] });
		expect(w).toMatchObject({ startSec: 1, sceneCutCount: 1, hasCues: true });
	});

	it('rejects corrupt timestamps', () => {
		expect(() => selectClipWindowV1({ durationSec: 60, clipSeconds: 20, transcriptSegments: [seg(5000, 1000, 'bad')], sceneCutsSec: [] })).toThrow(RangeError);
		expect(() => selectClipWindowV1({ durationSec: 60, clipSeconds: 20, transcriptSegments: [], sceneCutsSec: [Number.NaN] })).toThrow(RangeError);
		expect(() => selectClipWindowV1({ durationSec: 60, clipSeconds: 20, transcriptSegments: [], sceneCutsSec: [61] })).toThrow(RangeError);
	});
});
