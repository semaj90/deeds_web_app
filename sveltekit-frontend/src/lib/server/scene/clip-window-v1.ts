/**
 * Deterministic clip-window selection for scene storyboards (SCENE-18).
 *
 * Pure function: the same inputs always produce the same window. A window is scored by
 * cue density: transcript words in segments whose midpoint falls inside the window, plus a
 * fixed bonus per scene cut inside it. Ties resolve to the earliest start. The weights are
 * policy v1 constants and changing them requires a new policy version.
 */

export const CLIP_WINDOW_POLICY_V1 = 'atlas.scene-clip-window.v1';
export const CLIP_WINDOW_WORD_WEIGHT = 1;
export const CLIP_WINDOW_SCENE_CUT_WEIGHT = 5;

export interface ClipWindowTranscriptSegmentV1 {
	startMs: number;
	endMs: number;
	text: string;
}

export interface ClipWindowInputV1 {
	durationSec: number;
	clipSeconds: number;
	/** Start-time grid step. Defaults to 1 s. */
	stepSec?: number;
	transcriptSegments: readonly ClipWindowTranscriptSegmentV1[];
	/** Scene-cut timestamps in seconds from the source start. */
	sceneCutsSec: readonly number[];
}

export interface ClipWindowV1 {
	policy: typeof CLIP_WINDOW_POLICY_V1;
	clipSeconds: number;
	startSec: number;
	endSec: number;
	score: number;
	wordCount: number;
	sceneCutCount: number;
	/** False when no transcript words or scene cuts exist; the window then carries no cue evidence. */
	hasCues: boolean;
}

function assertFinite(name: string, value: number): void {
	if (!Number.isFinite(value)) throw new RangeError(`${name} must be a finite number`);
}

function countWords(text: string): number {
	const trimmed = text.trim();
	return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

export function selectClipWindowV1(input: ClipWindowInputV1): ClipWindowV1 {
	const { durationSec, clipSeconds } = input;
	const stepSec = input.stepSec ?? 1;
	assertFinite('durationSec', durationSec);
	assertFinite('clipSeconds', clipSeconds);
	assertFinite('stepSec', stepSec);
	if (clipSeconds <= 0) throw new RangeError('clipSeconds must be positive');
	if (stepSec <= 0) throw new RangeError('stepSec must be positive');
	if (clipSeconds > durationSec) throw new RangeError('clipSeconds exceeds durationSec');

	for (const segment of input.transcriptSegments) {
		assertFinite('segment.startMs', segment.startMs);
		assertFinite('segment.endMs', segment.endMs);
		if (segment.endMs < segment.startMs) throw new RangeError('transcript segment ends before it starts');
	}
	for (const cut of input.sceneCutsSec) {
		assertFinite('sceneCutSec', cut);
		if (cut < 0 || cut > durationSec) throw new RangeError('scene cut outside source duration');
	}

	// Midpoints in seconds, so a segment counts toward exactly one window position per start.
	const midpoints = input.transcriptSegments.map((segment) => ({
		midSec: (segment.startMs + segment.endMs) / 2000,
		words: countWords(segment.text),
	}));

	let best: ClipWindowV1 | null = null;
	const lastStart = durationSec - clipSeconds;
	// Integer index avoids floating-point drift in the start grid.
	const steps = Math.floor(lastStart / stepSec + 1e-9);
	for (let i = 0; i <= steps; i += 1) {
		const startSec = i * stepSec;
		const endSec = startSec + clipSeconds;
		let wordCount = 0;
		for (const midpoint of midpoints) {
			if (midpoint.midSec >= startSec && midpoint.midSec < endSec) wordCount += midpoint.words;
		}
		let sceneCutCount = 0;
		for (const cut of input.sceneCutsSec) {
			if (cut >= startSec && cut < endSec) sceneCutCount += 1;
		}
		const score = wordCount * CLIP_WINDOW_WORD_WEIGHT + sceneCutCount * CLIP_WINDOW_SCENE_CUT_WEIGHT;
		// Strictly greater: an equal score keeps the earlier window.
		if (best === null || score > best.score) {
			best = {
				policy: CLIP_WINDOW_POLICY_V1,
				clipSeconds,
				startSec,
				endSec,
				score,
				wordCount,
				sceneCutCount,
				hasCues: wordCount > 0 || sceneCutCount > 0,
			};
		}
	}
	if (best === null) throw new RangeError('no clip window fits the source duration');
	return best;
}
