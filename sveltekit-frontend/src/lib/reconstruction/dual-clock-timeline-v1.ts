/**
 * Parent Atlas Dual-Clock Character Animation & 5-Track Timeline Engine (v1)
 *
 * Implements ENG-03:
 * - Enforces strict dual-clock separation:
 *   * `interactive_preview`: mixer.update(deltaSeconds)
 *   * `deterministic_review`: mixer.setTime(targetTimelineSeconds)
 *   * Invariant: Never call both against the same mixer in the same frame.
 * - Defines the 5 synchronized horizontal tracks:
 *   1. TransformTrack
 *   2. SkeletalTrack ('Stand By' | 'Walk' | 'Inspect' | 'Reach')
 *   3. MorphTrack
 *   4. EvidenceTrack (video PTS + frame index)
 *   5. EventTrack (dialogue callouts + camera cues)
 */

export const TIMELINE_CLOCK_MODES_V1 = ['interactive_preview', 'deterministic_review'] as const;
export type TimelineClockModeV1 = (typeof TIMELINE_CLOCK_MODES_V1)[number];

export const SKELETAL_CLIP_STATES_V1 = ['Stand By', 'Walk', 'Inspect', 'Reach'] as const;
export type SkeletalClipStateV1 = (typeof SKELETAL_CLIP_STATES_V1)[number];

export const TIMELINE_TRACK_KINDS_V1 = [
	'TransformTrack',
	'SkeletalTrack',
	'MorphTrack',
	'EvidenceTrack',
	'EventTrack'
] as const;
export type TimelineTrackKindV1 = (typeof TIMELINE_TRACK_KINDS_V1)[number];

export interface TimelineTrackItemV1 {
	readonly id: string;
	readonly track: TimelineTrackKindV1;
	readonly label: string;
	readonly startSeconds: number;
	readonly endSeconds: number;
	readonly skeletalState?: SkeletalClipStateV1;
	readonly videoPtsMs?: number;
	readonly frameIndex?: number;
	readonly evidenceId?: string;
}

export interface AnimationMixerLikeV1 {
	update(deltaSeconds: number): void;
	setTime(timeInSeconds: number): void;
}

export interface DualClockStepReceiptV1 {
	readonly frameId: number;
	readonly mode: TimelineClockModeV1;
	readonly methodInvoked: 'update' | 'setTime';
	readonly timeSeconds: number;
}

/**
 * Enforces the ENG-03 dual-clock invariant: a single frame may invoke
 * either `mixer.update(delta)` OR `mixer.setTime(targetSeconds)`, never both.
 */
export class DualClockMixerControllerV1 {
	private mode: TimelineClockModeV1 = 'deterministic_review';
	private currentTimeSeconds = 0;
	private frameCounter = 0;
	private lastFrameMethod: { frameId: number; method: 'update' | 'setTime' } | null = null;

	constructor(private readonly durationSeconds = 20) {
		if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
			throw new RangeError('Timeline duration must be positive and finite');
		}
	}

	getMode(): TimelineClockModeV1 {
		return this.mode;
	}

	setMode(mode: TimelineClockModeV1): void {
		this.mode = mode;
	}

	getTimeSeconds(): number {
		return this.currentTimeSeconds;
	}

	getDurationSeconds(): number {
		return this.durationSeconds;
	}

	stepFrame(
		mixer: AnimationMixerLikeV1,
		input: { deltaSeconds?: number; targetTimelineSeconds?: number }
	): DualClockStepReceiptV1 {
		const frameId = ++this.frameCounter;

		if (this.mode === 'interactive_preview') {
			const delta = Math.max(0, Math.min(0.25, input.deltaSeconds ?? 0));
			if (this.lastFrameMethod?.frameId === frameId) {
				throw new Error('DUAL_CLOCK_INVARIANT_VIOLATION: Multiple mixer advances in same frame');
			}
			this.lastFrameMethod = { frameId, method: 'update' };
			mixer.update(delta);
			this.currentTimeSeconds = (this.currentTimeSeconds + delta) % this.durationSeconds;
			return {
				frameId,
				mode: this.mode,
				methodInvoked: 'update',
				timeSeconds: this.currentTimeSeconds
			};
		}

		const target = Math.max(
			0,
			Math.min(this.durationSeconds, input.targetTimelineSeconds ?? this.currentTimeSeconds)
		);
		if (this.lastFrameMethod?.frameId === frameId) {
			throw new Error('DUAL_CLOCK_INVARIANT_VIOLATION: Multiple mixer seeks in same frame');
		}
		this.lastFrameMethod = { frameId, method: 'setTime' };
		mixer.setTime(target);
		this.currentTimeSeconds = target;

		return {
			frameId,
			mode: this.mode,
			methodInvoked: 'setTime',
			timeSeconds: this.currentTimeSeconds
		};
	}
}

export function getActiveTrackItemsAtTimeV1(
	items: readonly TimelineTrackItemV1[],
	timeSeconds: number
): TimelineTrackItemV1[] {
	return items.filter((item) => timeSeconds >= item.startSeconds && timeSeconds <= item.endSeconds);
}
